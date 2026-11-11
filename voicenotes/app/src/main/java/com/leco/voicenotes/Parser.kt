package com.leco.voicenotes

import java.text.Normalizer

/**
 * Separa lo dictado en (categoría, contenido).
 * Acepta "trabajo llamar a Pedro" o "añadir nota de compra leche y pan".
 */
object Parser {
    private val CATS = linkedMapOf(
        "trabajo" to listOf("trabajo", "laboral", "curro"),
        "casa" to listOf("casa", "hogar"),
        "compra" to listOf("lista de la compra", "comprar", "compras", "compra", "supermercado", "super"),
        "lugar" to listOf("lugar", "sitio", "ubicacion", "direccion")
    )

    /** Palabras que forman parte de la nota («comprar leche» se queda como «Comprar leche»). */
    private val KEEP = setOf("comprar")
    private val FALLBACK = Regex("\\b(comprar|compra|compras|supermercado)\\b")

    private val REGEX: Regex
    private val KEY_TO_CAT = HashMap<String, String>()

    init {
        val keys = ArrayList<String>()
        for ((cat, words) in CATS) for (w in words) {
            keys.add(w)
            KEY_TO_CAT[w] = cat
        }
        keys.sortByDescending { it.length }
        val alt = keys.joinToString("|") { Regex.escape(it) }
        REGEX = Regex(
            "^(?:(?:anadir|anade|agrega|agregar|apunta|apuntar|anota|anotar|crea|crear|nueva|nuevo|pon|poner)\\s+)?" +
                "(?:una\\s+)?(?:nota\\s+)?(?:(?:de|en|a|para|como)\\s+)?(?:la\\s+|el\\s+)?" +
                "($alt)\\b[\\s:,.]*(.*)$"
        )
    }

    private fun strip(s: String) =
        Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")

    fun parse(raw: String): Pair<String, String> {
        val original = raw.trim()
        if (original.isEmpty()) return "general" to ""
        val flat = strip(original.lowercase())
        val m = REGEX.find(flat)
            ?: return (if (FALLBACK.containsMatchIn(flat)) "compra" else "general") to cap(original)
        val key = m.groupValues[1]
        val cat = KEY_TO_CAT[key] ?: "general"
        if (key in KEEP) return cat to cap(original)
        val rest = m.groups[2]!!
        val content = if (flat.length == original.length) original.substring(rest.range.first) else rest.value
        return cat to cap(content.ifBlank { original })
    }

    private fun cap(s: String) = s.trim().replaceFirstChar { it.uppercase() }
}
