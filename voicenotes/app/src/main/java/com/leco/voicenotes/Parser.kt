package com.leco.voicenotes

import java.text.Normalizer

/**
 * Separa lo dictado en (clave de pestaña, contenido) usando las palabras de cada pestaña.
 *  1. Si empieza por una palabra de «words» (o el nombre de la pestaña): se quita del texto.
 *     Admite «añadir nota de trabajo llamar a Pedro» además de «trabajo llamar a Pedro».
 *  2. Si no, y alguna palabra de «anywhere» aparece en cualquier parte: se conserva todo el texto.
 *  3. Si nada coincide: General.
 */
object Parser {
    private val PREFIX =
        "^(?:(?:anadir|anade|agrega|agregar|apunta|apuntar|anota|anotar|crea|crear|nueva|nuevo|pon|poner)\\s+)?" +
            "(?:una\\s+)?(?:nota\\s+)?(?:(?:de|en|a|para|como)\\s+)?(?:la\\s+|el\\s+)?"

    private fun norm(s: String) =
        Normalizer.normalize(s.lowercase().trim(), Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")

    fun parse(raw: String, cats: List<CatDef>): Pair<String, String> {
        val original = raw.trim()
        if (original.isEmpty()) return CatStore.GENERAL to ""
        val flat = norm(original)

        // 1. palabra al empezar
        val start = ArrayList<Pair<String, String>>()
        for (c in cats) {
            if (c.key == CatStore.GENERAL) continue
            for (w in c.words + c.label) {
                val n = norm(w)
                if (n.isNotEmpty()) start.add(n to c.key)
            }
        }
        if (start.isNotEmpty()) {
            val byWord = HashMap<String, String>()
            for ((w, k) in start) byWord.putIfAbsent(w, k)
            val alt = byWord.keys.sortedByDescending { it.length }.joinToString("|") { Regex.escape(it) }
            val m = Regex("$PREFIX($alt)\\b[\\s:,.]*(.*)$").find(flat)
            if (m != null) {
                val key = byWord[m.groupValues[1]] ?: CatStore.GENERAL
                val rest = m.groups[2]!!
                val content = if (flat.length == original.length) original.substring(rest.range.first) else rest.value
                return key to cap(content.ifBlank { original })
            }
        }

        // 2. palabra en cualquier parte
        for (c in cats) {
            for (w in c.anywhere) {
                val n = norm(w)
                if (n.isNotEmpty() && Regex("\\b${Regex.escape(n)}\\b").containsMatchIn(flat)) return c.key to cap(original)
            }
        }
        return CatStore.GENERAL to cap(original)
    }

    private fun cap(s: String) = s.trim().replaceFirstChar { it.uppercase() }
}
