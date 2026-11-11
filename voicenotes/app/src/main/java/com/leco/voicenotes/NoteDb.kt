package com.leco.voicenotes

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class Note(
    val id: Long,
    val text: String,
    val cat: String,
    val ts: Long,
    val lat: Double?,
    val lon: Double?,
    val notified: Boolean,
    val done: Boolean = false
)

class NoteDb(ctx: Context) : SQLiteOpenHelper(ctx.applicationContext, "notes.db", null, 3) {

    private val cols = "id,text,cat,ts,lat,lon,notified,done"

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE notes(" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "text TEXT NOT NULL," +
                "cat TEXT NOT NULL," +
                "ts INTEGER NOT NULL," +
                "lat REAL," +
                "lon REAL," +
                "notified INTEGER NOT NULL DEFAULT 0," +
                "synced INTEGER NOT NULL DEFAULT 0," +
                "done INTEGER NOT NULL DEFAULT 0)"
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) db.execSQL("ALTER TABLE notes ADD COLUMN synced INTEGER NOT NULL DEFAULT 0")
        if (oldVersion < 3) db.execSQL("ALTER TABLE notes ADD COLUMN done INTEGER NOT NULL DEFAULT 0")
    }

    private fun read(c: Cursor) = Note(
        c.getLong(0), c.getString(1), c.getString(2), c.getLong(3),
        if (c.isNull(4)) null else c.getDouble(4),
        if (c.isNull(5)) null else c.getDouble(5),
        c.getInt(6) != 0,
        c.getInt(7) != 0
    )

    private fun query(where: String?, args: Array<String>?, order: String): List<Note> {
        val out = ArrayList<Note>()
        val sql = "SELECT $cols FROM notes" + (if (where != null) " WHERE $where" else "") + " ORDER BY $order"
        readableDatabase.rawQuery(sql, args).use { while (it.moveToNext()) out.add(read(it)) }
        return out
    }

    @Synchronized
    fun insert(text: String, cat: String, lat: Double?, lon: Double?): Long {
        val v = ContentValues().apply {
            put("text", text)
            put("cat", cat)
            put("ts", System.currentTimeMillis())
            if (lat != null && lon != null) {
                put("lat", lat)
                put("lon", lon)
            }
        }
        return writableDatabase.insert("notes", null, v)
    }

    @Synchronized
    fun all(cat: String?): List<Note> =
        if (cat == null) query(null, null, "ts DESC") else query("cat=?", arrayOf(cat), "ts DESC")

    /** Notas de lugar con coordenadas que aún no se han avisado por voz. */
    fun pendingPlaces(): List<Note> =
        all("lugar").filter { it.lat != null && it.lon != null && !it.notified }

    @Synchronized
    fun markNotified(id: Long) = set(id, "notified", 1)

    @Synchronized
    fun toggleDone(id: Long, done: Boolean) = set(id, "done", if (done) 1 else 0)

    @Synchronized
    fun delete(id: Long) {
        writableDatabase.delete("notes", "id=?", arrayOf(id.toString()))
    }

    /** Notas aún no enviadas a Tesla Drive, de más antigua a más reciente. */
    @Synchronized
    fun unsynced(): List<Note> = query("synced=0", null, "ts ASC")

    @Synchronized
    fun markSynced(id: Long) = set(id, "synced", 1)

    /** Marca todas como pendientes para reenviarlas (botón «Reenviar»). */
    @Synchronized
    fun resetSynced() {
        val v = ContentValues().apply { put("synced", 0) }
        writableDatabase.update("notes", v, null, null)
    }

    private fun set(id: Long, col: String, value: Int) {
        val v = ContentValues().apply { put(col, value) }
        writableDatabase.update("notes", v, "id=?", arrayOf(id.toString()))
    }
}
