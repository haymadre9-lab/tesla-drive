package com.leco.voicenotes

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Envía las notas a Tesla Drive por ntfy.sh, cifradas.
 * Protocolo (idéntico a notes.js de Tesla Drive):
 *  - código normalizado = minúsculas, solo [a-z0-9]
 *  - tema  = "ln-" + SHA-256("topic:" + código) en hexadecimal, primeros 32 caracteres
 *  - clave = PBKDF2-HMAC-SHA256(código, sal "lecoauto-notas-v1", 100000 vueltas, 256 bits)
 *  - mensaje = "e1:" + base64( iv[12] + AES-GCM(JSON UTF-8) )
 */
object NoteSync {
    private const val PREFS = "cfg"
    private const val BASE = "https://ntfy.sh/"
    private val pool: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private var periodic = false
    @Volatile var lastStatus = ""

    fun code(ctx: Context): String = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("code", "") ?: ""
    fun setCode(ctx: Context, c: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("code", c.trim()).apply()
    }

    fun norm(c: String) = c.lowercase().filter { it in 'a'..'z' || it in '0'..'9' }
    fun valid(c: String) = norm(c).length >= 8

    fun randomCode(): String {
        val a = "abcdefghjkmnpqrstuvwxyz23456789"
        val r = SecureRandom()
        return (1..12).map { a[r.nextInt(a.length)] }.joinToString("")
    }

    fun topic(code: String): String {
        val h = MessageDigest.getInstance("SHA-256").digest(("topic:" + norm(code)).toByteArray(Charsets.UTF_8))
        return "ln-" + h.joinToString("") { "%02x".format(it) }.take(32)
    }

    private var cachedFor = ""
    private var cachedKey: SecretKeySpec? = null

    private fun key(code: String): SecretKeySpec {
        val n = norm(code)
        if (cachedFor == n && cachedKey != null) return cachedKey!!
        val raw = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
            .generateSecret(PBEKeySpec(n.toCharArray(), "lecoauto-notas-v1".toByteArray(Charsets.UTF_8), 100000, 256))
            .encoded
        return SecretKeySpec(raw, "AES").also { cachedFor = n; cachedKey = it }
    }

    private fun encrypt(code: String, json: String): String {
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key(code), GCMParameterSpec(128, iv))
        val ct = c.doFinal(json.toByteArray(Charsets.UTF_8))
        return "e1:" + Base64.getEncoder().encodeToString(iv + ct)
    }

    private fun payload(n: Note): String = JSONObject().apply {
        put("i", "${n.ts}-${n.id}")
        put("t", n.text)
        put("c", n.cat)
        put("s", n.ts)
        if (n.lat != null && n.lon != null) {
            put("la", n.lat)
            put("lo", n.lon)
        }
    }.toString()

    private fun post(code: String, n: Note): Boolean {
        val conn = URL(BASE + topic(code)).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "text/plain")
            conn.outputStream.use { it.write(encrypt(code, payload(n)).toByteArray(Charsets.UTF_8)) }
            return conn.responseCode in 200..299
        } finally {
            conn.disconnect()
        }
    }

    /** Envía las notas pendientes, en orden. Se detiene al primer fallo (sin cobertura) y reintenta luego. */
    fun syncNow(ctx: Context, db: NoteDb) {
        val code = code(ctx)
        if (!valid(code)) { lastStatus = "Sin código de sincronización"; return }
        val pending = db.unsynced()
        if (pending.isEmpty()) { lastStatus = "Sincronizado"; return }
        for (n in pending) {
            val ok = try { post(code, n) } catch (e: Exception) { false }
            if (!ok) { lastStatus = "Sin conexión: ${pending.size} nota(s) pendientes"; return }
            db.markSynced(n.id)
        }
        lastStatus = "Sincronizado"
    }

    /** Lanza un envío ya, en segundo plano. */
    fun kick(ctx: Context, db: NoteDb) {
        val app = ctx.applicationContext
        pool.execute { try { syncNow(app, db) } catch (_: Exception) {} }
    }

    /** Reintento cada minuto mientras el servicio esté vivo (por si no había cobertura). */
    @Synchronized
    fun startPeriodic(ctx: Context, db: NoteDb) {
        if (periodic) return
        periodic = true
        val app = ctx.applicationContext
        pool.scheduleWithFixedDelay({ try { syncNow(app, db) } catch (_: Exception) {} }, 5, 60, TimeUnit.SECONDS)
    }
}
