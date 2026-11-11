package com.leco.voicenotes

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class Note(
    val id: Long,
    val text: String,
    val cat: String,
    val ts: Long,
    val lat: Double?,
    val lon: Double?,
    val notified: Boolean
)

class NoteDb(ctx: Context) : SQLiteOpenHelper(ctx.applicationContext, "notes.db", null, 2) {

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
                "synced INTEGER NOT NULL DEFAULT 0)"
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) db.execSQL("ALTER TABLE notes ADD COLUMN synced INTEGER NOT NULL DEFAULT 0")
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
    fun all(cat: String?): List<Note> {
        val out = ArrayList<Note>()
        val c = if (cat == null)
            readableDatabase.rawQuery("SELECT id,text,cat,ts,lat,lon,notified FROM notes ORDER BY ts DESC", null)
        else
            readableDatabase.rawQuery(
                "SELECT id,text,cat,ts,lat,lon,notified FROM notes WHERE cat=? ORDER BY ts DESC",
                arrayOf(cat)
            )
        c.use {
            while (it.moveToNext()) {
                out.add(
                    Note(
                        it.getLong(0), it.getString(1), it.getString(2), it.getLong(3),
                        if (it.isNull(4)) null else it.getDouble(4),
                        if (it.isNull(5)) null else it.getDouble(5),
                        it.getInt(6) != 0
                    )
                )
            }
        }
        return out
    }

    /** Notas de lugar con coordenadas que aún no se han avisado por voz. */
    fun pendingPlaces(): List<Note> =
        all("lugar").filter { it.lat != null && it.lon != null && !it.notified }

    @Synchronized
    fun markNotified(id: Long) {
        val v = ContentValues().apply { put("notified", 1) }
        writableDatabase.update("notes", v, "id=?", arrayOf(id.toString()))
    }

    @Synchronized
    fun delete(id: Long) {
        writableDatabase.delete("notes", "id=?", arrayOf(id.toString()))
    }

    /** Notas aún no enviadas a Tesla Drive, de más antigua a más reciente. */
    @Synchronized
    fun unsynced(): List<Note> {
        val out = ArrayList<Note>()
        readableDatabase.rawQuery(
            "SELECT id,text,cat,ts,lat,lon,notified FROM notes WHERE synced=0 ORDER BY ts ASC", null
        ).use {
            while (it.moveToNext()) {
                out.add(
                    Note(
                        it.getLong(0), it.getString(1), it.getString(2), it.getLong(3),
                        if (it.isNull(4)) null else it.getDouble(4),
                        if (it.isNull(5)) null else it.getDouble(5),
                        it.getInt(6) != 0
                    )
                )
            }
        }
        return out
    }

    @Synchronized
    fun markSynced(id: Long) {
        val v = ContentValues().apply { put("synced", 1) }
        writableDatabase.update("notes", v, "id=?", arrayOf(id.toString()))
    }

    /** Marca todas como pendientes para reenviarlas (botón «Reenviar»). */
    @Synchronized
    fun resetSynced() {
        val v = ContentValues().apply { put("synced", 0) }
        writableDatabase.update("notes", v, null, null)
    }
}
