package com.leco.voicenotes

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Una pestaña (tipo de nota).
 *  - words: palabras que dices AL EMPEZAR la nota («trabajo llamar a Pedro»); se quitan del texto.
 *  - anywhere: palabras que, en CUALQUIER parte de la frase, la meten aquí; el texto se conserva.
 */
data class CatDef(
    val key: String,
    val label: String,
    val emoji: String,
    val color: Int,
    val words: List<String>,
    val anywhere: List<String>
)

object CatStore {
    private const val PREFS = "cats"
    const val GENERAL = "general"

    val GENERAL_DEF = CatDef(GENERAL, "General", "📝", 0xFF8E6CEF.toInt(), emptyList(), emptyList())

    val PALETTE = listOf(
        0xFF1E88E5.toInt(), 0xFFFB8C00.toInt(), 0xFF43A047.toInt(), 0xFFE53935.toInt(),
        0xFF00ACC1.toInt(), 0xFF8E6CEF.toInt(), 0xFFEC407A.toInt(), 0xFFFDD835.toInt()
    )
    val EMOJIS = listOf("💼", "🏠", "🛒", "📍", "✊", "🔧", "💰", "🚗", "📞", "📅", "❤️", "⭐")

    fun defaults(): List<CatDef> = listOf(
        CatDef("trabajo", "Trabajo", "💼", 0xFF1E88E5.toInt(), listOf("trabajo", "laboral", "curro"), emptyList()),
        CatDef("casa", "Casa", "🏠", 0xFFFB8C00.toInt(), listOf("casa", "hogar"), emptyList()),
        CatDef(
            "compra", "Compra", "🛒", 0xFF43A047.toInt(),
            listOf("lista de la compra", "compras", "compra", "supermercado", "super"),
            listOf("comprar", "compra", "compras", "supermercado")
        ),
        CatDef("lugar", "Lugar", "📍", 0xFFE53935.toInt(), listOf("lugar", "sitio", "ubicación", "dirección"), emptyList()),
        CatDef("sindicato", "Sindicato", "✊", 0xFF00ACC1.toInt(), listOf("sindicato", "sindical"), listOf("sindicato", "sindical"))
    )

    @Volatile private var cache: List<CatDef>? = null

    /** Pestañas editables + «General» siempre al final. */
    fun all(ctx: Context): List<CatDef> {
        cache?.let { return it }
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("list", null)
        val editable = if (raw == null) defaults() else try {
            val a = JSONArray(raw)
            (0 until a.length()).map { read(a.getJSONObject(it)) }
        } catch (_: Exception) {
            defaults()
        }
        return (editable.filter { it.key != GENERAL } + GENERAL_DEF).also { cache = it }
    }

    fun find(ctx: Context, key: String): CatDef = all(ctx).firstOrNull { it.key == key } ?: GENERAL_DEF

    private fun save(ctx: Context, editable: List<CatDef>) {
        val a = JSONArray()
        editable.forEach { a.put(write(it)) }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("list", a.toString()).apply()
        cache = null
    }

    fun upsert(ctx: Context, c: CatDef) {
        val cur = all(ctx).filter { it.key != GENERAL }
        val next = if (cur.any { it.key == c.key }) cur.map { if (it.key == c.key) c else it } else cur + c
        save(ctx, next)
    }

    fun remove(ctx: Context, key: String) {
        if (key == GENERAL) return
        save(ctx, all(ctx).filter { it.key != GENERAL && it.key != key })
    }

    /** Clave interna estable a partir del nombre (no cambia al renombrar la pestaña). */
    fun newKey(ctx: Context, label: String): String {
        val base = label.lowercase().filter { it in 'a'..'z' || it in '0'..'9' }.ifEmpty { "tipo" }.take(20)
        val used = all(ctx).map { it.key }.toSet()
        if (base !in used) return base
        var i = 2
        while ("$base$i" in used) i++
        return "$base$i"
    }

    private fun write(c: CatDef) = JSONObject().apply {
        put("k", c.key); put("l", c.label); put("e", c.emoji); put("c", c.color)
        put("w", JSONArray(c.words)); put("a", JSONArray(c.anywhere))
    }

    private fun read(o: JSONObject): CatDef {
        fun list(n: String) = o.optJSONArray(n)?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
        return CatDef(o.getString("k"), o.getString("l"), o.optString("e", "🏷"), o.optInt("c", 0xFF8E6CEF.toInt()), list("w"), list("a"))
    }
}
