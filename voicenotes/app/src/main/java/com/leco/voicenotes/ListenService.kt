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
        const val WAKE = "oye nota"
        const val ACTION_STOP = "com.leco.voicenotes.STOP"
        private const val CHANNEL = "listen"
        private const val NOTIF_ID = 1
        private const val RATE = 16000
        private const val VOICE_RMS = 600      // umbral de energía para considerar "hay voz"
        private const val NEAR_METERS = 250f

        @Volatile var running = false
        @Volatile var status = "Detenido"
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
            stopSelf()
            return START_NOT_STICKY
        }
        if (running) return START_STICKY
        startInForeground()
        running = true
        stopFlag = false

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
        try { lm.removeUpdates(locListener) } catch (_: Exception) {}
        worker?.interrupt()
        tts?.shutdown()
        tone?.release()
        try { wakeLock?.release() } catch (_: Exception) {}
        super.onDestroy()
    }

    // ---------- notificación fija ----------

    private fun startInForeground() {
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
            .setContentText("Di \"$WAKE\" para dictar una nota")
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
        } catch (e: Exception) {
            status = "No se pudo iniciar: ${e.message}"
            stopSelf()
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
        val wake = Recognizer(model, RATE.toFloat(), "[\"$WAKE\", \"[unk]\"]")
        val buf = ShortArray(2048)
        var lastVoice = 0L
        var fed = false

        rec.startRecording()
        status = "Escuchando: di \"$WAKE\""
        try {
            while (!stopFlag) {
                if (announce.isNotEmpty()) {
                    val msg = announce.poll()
                    if (msg != null) speak(rec, msg)
                    wake.reset(); fed = false
                    continue
                }
                val n = rec.read(buf, 0, buf.size)
                if (n <= 0) { Thread.sleep(20); continue }
                val now = SystemClock.elapsedRealtime()
                if (rms(buf, n) > VOICE_RMS) lastVoice = now

                // Solo alimentamos el reconocedor cuando hay voz: ahorra mucha CPU/batería.
                if (now - lastVoice < 1200) {
                    fed = true
                    val end = wake.acceptWaveForm(buf, n)
                    val json = if (end) wake.result else wake.partialResult
                    val t = JSONObject(json).let { it.optString("text", "") + it.optString("partial", "") }
                    if (t.contains(WAKE)) {
                        wake.reset(); fed = false; lastVoice = 0
                        handleNote(model, rec, buf)
                        status = "Escuchando: di \"$WAKE\""
                    } else if (end) {
                        fed = false
                    }
                } else if (fed) {
                    wake.finalResult
                    wake.reset()
                    fed = false
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

    private fun handleNote(model: Model, rec: AudioRecord, buf: ShortArray) {
        status = "Dime la nota…"
        beep(rec)
        val raw = dictate(model, rec, buf)
        if (raw.isBlank()) {
            speak(rec, "No te he entendido")
            return
        }
        val (cat, content) = Parser.parse(raw)
        val loc = lastLoc
        db.insert(content, cat, loc?.latitude, loc?.longitude)
        NoteSync.kick(this, db)
        status = "Guardado en $cat: $content"
        speak(rec, "Anotado en $cat")
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
                if (heard && now - lastVoice > 2000) break   // 2 s de silencio: fin de la nota
                if (!heard && now - start > 7000) break      // no ha dicho nada
                if (now - start > 45_000) break              // tope de seguridad
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
