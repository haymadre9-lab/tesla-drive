package com.leco.voicenotes

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.AssetManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.ToneGenerator
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.Locale
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.math.abs

/**
 * Escucha en segundo plano con Vosk (offline, gratis):
 *  1. Detecta la frase "oye nota" (gramática restringida, muy ligera).
 *  2. Pita, transcribe la nota hasta 2 s de silencio.
 *  3. La clasifica, la guarda con la ubicación y confirma por voz.
 * Además avisa por voz al pasar cerca de una nota de lugar.
 */
class ListenService : Service() {

    companion object {
        const val DEFAULT_WAKE = "oye nota"
        const val ACTION_STOP = "com.leco.voicenotes.STOP"
        private const val CHANNEL = "listen"
        private const val NOTIF_ID = 1
        private const val RATE = 16000
        private const val VOICE_RMS = 600      // umbral de energía para considerar "hay voz"
        private const val NEAR_METERS = 250f
        private const val MAX_WORDS = 40           // una nota hablada es corta: más palabras = conversación
        private const val MAX_DICTATION_MS = 25_000L

        @Volatile var running = false
        @Volatile var status = "Detenido"

        /** Estado que sobrevive si Android mata el proceso: want = el usuario quiere escuchar; alive = servicio vivo. */
        fun prefs(ctx: Context) = ctx.getSharedPreferences("state", Context.MODE_PRIVATE)

        fun wakePhrase(ctx: Context): String = prefs(ctx).getString("wake", DEFAULT_WAKE) ?: DEFAULT_WAKE
        fun setWake(ctx: Context, w: String) = prefs(ctx).edit().putString("wake", w).apply()

        fun event(ctx: Context, text: String) {
            val t = java.text.SimpleDateFormat("dd/MM HH:mm", Locale("es")).format(java.util.Date())
            prefs(ctx).edit().putString("lastEvent", "$t · $text").apply()
        }
    }

    private lateinit var db: NoteDb
    private lateinit var lm: LocationManager
    private var worker: Thread? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var tts: TextToSpeech? = null
    @Volatile private var ttsReady = false
    @Volatile private var stopFlag = false
    @Volatile private var lastLoc: Location? = null
    private val announce = ConcurrentLinkedQueue<String>()
    private var tone: ToneGenerator? = null

    private val locListener = object : LocationListener {
        override fun onLocationChanged(l: Location) {
            lastLoc = l
            checkNearby(l)
        }

        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        db = NoteDb(this)
        lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            prefs(this).edit().putBoolean("want", false).apply()
            stopSelf()
            return START_NOT_STICKY
        }
        if (running) return START_STICKY
        if (!startInForeground()) {
            stopSelf()
            return START_NOT_STICKY
        }
        running = true
        stopFlag = false
        prefs(this).edit().putBoolean("alive", true).apply()

        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "voicenotes:listen").apply { acquire() }

        tts = TextToSpeech(this) { s ->
            if (s == TextToSpeech.SUCCESS) {
                tts?.language = Locale("es", "ES")
                ttsReady = true
            }
        }
        try {
            tone = ToneGenerator(AudioManager.STREAM_MUSIC, 90)
        } catch (_: RuntimeException) {
        }
        startLocation()
        NoteSync.startPeriodic(this, db)

        worker = Thread({ loop() }, "voicenotes-listen").also { it.start() }
        return START_STICKY
    }

    override fun onDestroy() {
        stopFlag = true
        running = false
        status = "Detenido"
        prefs(this).edit().putBoolean("alive", false).apply()
        try { lm.removeUpdates(locListener) } catch (_: Exception) {}
        worker?.interrupt()
        tts?.shutdown()
        tone?.release()
        try { wakeLock?.release() } catch (_: Exception) {}
        super.onDestroy()
    }

    // ---------- notificación fija ----------

    private fun startInForeground(): Boolean {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Escucha de notas", NotificationManager.IMPORTANCE_LOW)
        )
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, ListenService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE
        )
        val n = Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("Notas de Voz")
            .setContentText("Di \"${wakePhrase(this)}\" para dictar una nota")
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(android.R.drawable.ic_delete, "Detener", stop).build())
            .build()
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                var type = android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                if (hasLocation()) type = type or android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                startForeground(NOTIF_ID, n, type)
            } else {
                startForeground(NOTIF_ID, n)
            }
            return true
        } catch (e: Exception) {
            status = "No se pudo iniciar: ${e.message}"
            event(this, "No se pudo reactivar la escucha (${e.javaClass.simpleName}). Ábrela desde la app.")
            return false
        }
    }

    // ---------- ubicación ----------

    private fun hasLocation() =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun startLocation() {
        if (!hasLocation()) return
        try {
            for (p in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)) {
                val l = lm.getLastKnownLocation(p)
                if (l != null && (lastLoc == null || l.time > lastLoc!!.time)) lastLoc = l
            }
            lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 60_000L, 100f, locListener)
            lm.requestLocationUpdates(LocationManager.PASSIVE_PROVIDER, 0L, 0f, locListener)
        } catch (_: SecurityException) {
        } catch (_: IllegalArgumentException) {
        }
    }

    private fun checkNearby(l: Location) {
        for (n in db.pendingPlaces()) {
            val out = FloatArray(1)
            Location.distanceBetween(l.latitude, l.longitude, n.lat!!, n.lon!!, out)
            if (out[0] < NEAR_METERS) {
                announce.add("Cerca de aquí tienes una nota: ${n.text}")
                db.markNotified(n.id)
            }
        }
    }

    // ---------- bucle de audio ----------

    private fun loop() {
        try {
            listen()
        } catch (e: Exception) {
            status = "Error: ${e.message}"
        }
    }

    private fun listen() {
        status = "Cargando modelo de voz…"
        val model = Model(ensureModel(this))
        val minBuf = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val rec = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuf, 8192) * 2
        )
        var phrase = wakePhrase(this)
        var wake = Recognizer(model, RATE.toFloat(), "[\"$phrase\", \"[unk]\"]")
        val buf = ShortArray(2048)
        var lastVoice = 0L
        var fed = false

        // Últimos segundos de audio con voz: para volver a escucharlos con el reconocedor completo si salta la frase.
        val seg = ShortArray(RATE * 6)
        var segLen = 0
        fun pushSeg(b: ShortArray, n: Int) {
            if (segLen + n > seg.size) {
                val keep = seg.size / 2
                System.arraycopy(seg, segLen - keep, seg, 0, keep)
                segLen = keep
            }
            System.arraycopy(b, 0, seg, segLen, n)
            segLen += n
        }

        rec.startRecording()
        status = "Escuchando: di \"$phrase\""
        try {
            while (!stopFlag) {
                // Si cambias la frase en Ajustes, se aplica sin reiniciar.
                val cur = wakePhrase(this)
                if (cur != phrase) {
                    phrase = cur
                    wake.close()
                    wake = Recognizer(model, RATE.toFloat(), "[\"$phrase\", \"[unk]\"]")
                    fed = false
                    status = "Escuchando: di \"$phrase\""
                }
                if (announce.isNotEmpty()) {
                    val msg = announce.poll()
                    if (msg != null) speak(rec, msg)
                    wake.reset(); fed = false; segLen = 0
                    continue
                }
                val n = rec.read(buf, 0, buf.size)
                if (n <= 0) { Thread.sleep(20); continue }
                val now = SystemClock.elapsedRealtime()
                if (rms(buf, n) > VOICE_RMS) lastVoice = now

                // Solo alimentamos el reconocedor cuando hay voz: ahorra mucha CPU/batería.
                var triggered = false
                if (now - lastVoice < 1200) {
                    fed = true
                    pushSeg(buf, n)
                    // Solo se decide con el resultado FINAL de una frase (nunca con hipótesis parciales).
                    if (wake.acceptWaveForm(buf, n)) {
                        fed = false
                        val heard = JSONObject(wake.result).optString("text", "")
                        if (isWake(heard, phrase)) triggered = confirmWake(model, seg, segLen, phrase, heard)
                        segLen = 0
                    }
                } else if (fed) {
                    fed = false
                    val heard = JSONObject(wake.finalResult).optString("text", "")
                    wake.reset()
                    if (isWake(heard, phrase)) triggered = confirmWake(model, seg, segLen, phrase, heard)
                    segLen = 0
                }
                if (triggered) {
                    wake.reset(); fed = false; lastVoice = 0; segLen = 0
                    handleNote(model, rec, buf)
                    status = "Escuchando: di \"$phrase\""
                }
            }
        } catch (_: InterruptedException) {
        } finally {
            try { rec.stop() } catch (_: Exception) {}
            rec.release()
            wake.close()
            model.close()
        }
    }

    /**
     * Primer filtro (barato): la frase debe ser la ÚNICA cosa dicha en esa tanda, con a lo sumo un ruido [unk].
     */
    private fun isWake(text: String, phrase: String): Boolean {
        val toks = text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        val unk = toks.count { it == "[unk]" }
        return unk <= 1 && toks.filter { it != "[unk]" }.joinToString(" ") == phrase
    }

    /**
     * Segundo filtro (fuerte): se vuelve a escuchar la misma grabación con el reconocedor COMPLETO del idioma.
     * Una conversación se transcribe como palabras reales y no se parece a la frase, así que se descarta.
     */
    private fun confirmWake(model: Model, seg: ShortArray, len: Int, phrase: String, heard: String): Boolean {
        var full = ""
        if (len > 0) {
            val r = Recognizer(model, RATE.toFloat())
            try {
                val tmp = ShortArray(2048)
                var off = 0
                while (off < len) {
                    val n = minOf(tmp.size, len - off)
                    System.arraycopy(seg, off, tmp, 0, n)
                    r.acceptWaveForm(tmp, n)
                    off += n
                }
                full = JSONObject(r.finalResult).optString("text", "")
            } finally {
                r.close()
            }
        }
        val a = flat(full)
        val b = flat(phrase)
        // Palabra por palabra: mismo número de palabras y, en cada una, como mucho 1 letra de diferencia
        // (2 en palabras de ≤3 letras, que el reconocedor confunde más: «oye»/«hoy»).
        val ta = a.split(" ")
        val tb = b.split(" ")
        val ok = a.isNotEmpty() && ta.size == tb.size &&
            ta.indices.all { lev(ta[it], tb[it]) <= (if (tb[it].length <= 3) 2 else 1) }
        logWake("oído «$heard» · comprobado «$full» ${if (ok) "✓ activada" else "✗ descartada"}")
        return ok
    }

    private fun flat(s: String) =
        java.text.Normalizer.normalize(s.lowercase(Locale("es")).trim(), java.text.Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "").replace(Regex("\\s+"), " ")

    private fun lev(a: String, b: String): Int {
        var prev = IntArray(b.length + 1) { it }
        for (i in 1..a.length) {
            val cur = IntArray(b.length + 1)
            cur[0] = i
            for (j in 1..b.length) {
                cur[j] = minOf(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1)
            }
            prev = cur
        }
        return prev[b.length]
    }

    /** Últimos intentos de activación, para ver en Ajustes qué está oyendo realmente. */
    private fun logWake(line: String) {
        val t = java.text.SimpleDateFormat("HH:mm:ss", Locale("es")).format(java.util.Date())
        val p = prefs(this)
        val old = (p.getString("wakeLog", "") ?: "").split("\n").filter { it.isNotBlank() }
        p.edit().putString("wakeLog", (listOf("$t · $line") + old).take(8).joinToString("\n")).apply()
    }

    private fun handleNote(model: Model, rec: AudioRecord, buf: ShortArray) {
        status = "Dime la nota…"
        beep(rec)
        val raw = dictate(model, rec, buf)
        if (raw.isBlank() || raw.trim().split(" ").size < 2) {
            speak(rec, "No te he entendido")
            return
        }
        if (raw.trim().split(" ").size > MAX_WORDS) {
            logWake("descartada por larga (${raw.trim().split(" ").size} palabras): «${raw.take(50)}…»")
            speak(rec, "Eso parece una conversación, no la guardo")
            return
        }
        val (cat, content) = Parser.parse(raw, CatStore.all(this))
        val label = CatStore.find(this, cat).label
        val loc = lastLoc
        db.insert(content, cat, loc?.latitude, loc?.longitude)
        NoteSync.kick(this, db)
        status = "Guardado en $label: $content"
        speak(rec, "Anotado en $label")
    }

    private fun dictate(model: Model, rec: AudioRecord, buf: ShortArray): String {
        val r = Recognizer(model, RATE.toFloat())
        val sb = StringBuilder()
        val start = SystemClock.elapsedRealtime()
        var lastVoice = start
        var heard = false
        try {
            while (!stopFlag) {
                val n = rec.read(buf, 0, buf.size)
                if (n <= 0) continue
                val now = SystemClock.elapsedRealtime()
                if (rms(buf, n) > VOICE_RMS) { lastVoice = now; heard = true }
                if (r.acceptWaveForm(buf, n)) sb.append(' ').append(JSONObject(r.result).optString("text", ""))
                if (heard && now - lastVoice > 1600) break   // 1,6 s de silencio: fin de la nota
                if (!heard && now - start > 5000) break      // no ha dicho nada
                if (now - start > MAX_DICTATION_MS) break     // tope de seguridad
            }
            sb.append(' ').append(JSONObject(r.finalResult).optString("text", ""))
        } finally {
            r.close()
        }
        return sb.toString().trim().replace(Regex("\\s+"), " ")
    }

    // ---------- audio de confirmación (el conductor no mira la pantalla) ----------

    private fun beep(rec: AudioRecord) {
        rec.stop()
        tone?.startTone(ToneGenerator.TONE_PROP_BEEP, 150)
        Thread.sleep(350)
        rec.startRecording()
    }

    private fun speak(rec: AudioRecord, text: String) {
        val t = tts
        if (t == null || !ttsReady) return
        rec.stop()
        t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "u")
        Thread.sleep(400)
        var waited = 0
        while (t.isSpeaking && waited < 8000) { Thread.sleep(100); waited += 100 }
        Thread.sleep(200)
        rec.startRecording()
    }

    private fun rms(b: ShortArray, n: Int): Int {
        var sum = 0L
        for (i in 0 until n) sum += abs(b[i].toInt())
        return (sum / n).toInt()
    }

    // ---------- modelo de voz empaquetado en el APK ----------

    private fun ensureModel(ctx: Context): String {
        val dst = File(ctx.filesDir, "model")
        val ok = File(dst, ".ok")
        if (!ok.exists()) {
            dst.deleteRecursively()
            copyAssets(ctx.assets, "model", dst)
            ok.writeText("1")
        }
        return dst.absolutePath
    }

    private fun copyAssets(am: AssetManager, path: String, dst: File) {
        val kids = am.list(path)
        if (kids.isNullOrEmpty()) {
            try {
                dst.parentFile?.mkdirs()
                am.open(path).use { i -> FileOutputStream(dst).use { o -> i.copyTo(o) } }
            } catch (_: IOException) {
            }
        } else {
            dst.mkdirs()
            for (k in kids) copyAssets(am, "$path/$k", File(dst, k))
        }
    }
}
