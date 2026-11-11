package com.leco.voicenotes

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ListView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : Activity() {

    private lateinit var db: NoteDb
    private lateinit var status: TextView
    private lateinit var toggle: Button
    private lateinit var sortBtn: Button
    private lateinit var filter: Spinner
    private lateinit var list: ListView

    private val cats = listOf("todas", "trabajo", "casa", "compra", "lugar", "general")
    private var notes: List<Note> = emptyList()
    private var byDist = false
    private var rendered: List<String> = emptyList()
    private val fmt = SimpleDateFormat("dd/MM HH:mm", Locale("es"))
    private val handler = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            refresh()
            handler.postDelayed(this, 2000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        db = NoteDb(this)
        status = findViewById(R.id.status)
        toggle = findViewById(R.id.toggle)
        sortBtn = findViewById(R.id.sort)
        filter = findViewById(R.id.filter)
        list = findViewById(R.id.list)

        filter.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, cats)
        filter.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) {
                rendered = emptyList()
                refresh()
            }

            override fun onNothingSelected(p: AdapterView<*>?) {}
        }

        toggle.setOnClickListener {
            if (ListenService.running) {
                startService(Intent(this, ListenService::class.java).setAction(ListenService.ACTION_STOP))
            } else {
                askPermissions()
            }
            handler.postDelayed({ refresh() }, 400)
        }
        sortBtn.setOnClickListener {
            byDist = !byDist
            sortBtn.text = if (byDist) "Orden: cercanía" else "Orden: fecha"
            rendered = emptyList()
            refresh()
        }
        findViewById<Button>(R.id.battery).setOnClickListener { openBatterySettings() }

        val codeBox = findViewById<EditText>(R.id.code)
        codeBox.setText(NoteSync.code(this))
        findViewById<Button>(R.id.codeSave).setOnClickListener {
            val c = codeBox.text.toString().trim()
            if (!NoteSync.valid(c)) {
                Toast.makeText(this, "Código demasiado corto (mínimo 8). Genera uno en Tesla Drive → 📝 → Enlace", Toast.LENGTH_LONG).show()
            } else {
                NoteSync.setCode(this, c)
                db.resetSynced()
                NoteSync.kick(this, db)
                Toast.makeText(this, "Código guardado; enviando notas…", Toast.LENGTH_SHORT).show()
            }
        }
        findViewById<Button>(R.id.resend).setOnClickListener {
            db.resetSynced()
            NoteSync.kick(this, db)
            Toast.makeText(this, "Reenviando todas las notas a Tesla Drive…", Toast.LENGTH_SHORT).show()
        }

        list.setOnItemClickListener { _, _, pos, _ ->
            val n = notes.getOrNull(pos) ?: return@setOnItemClickListener
            if (n.lat != null && n.lon != null) {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:${n.lat},${n.lon}?q=${n.lat},${n.lon}")))
                } catch (_: Exception) {
                    Toast.makeText(this, "No hay app de mapas", Toast.LENGTH_SHORT).show()
                }
            }
        }
        list.setOnItemLongClickListener { _, _, pos, _ ->
            val n = notes.getOrNull(pos) ?: return@setOnItemLongClickListener true
            AlertDialog.Builder(this)
                .setMessage("¿Borrar esta nota?\n\n${n.text}")
                .setPositiveButton("Borrar") { _, _ -> db.delete(n.id); rendered = emptyList(); refresh() }
                .setNegativeButton("Cancelar", null)
                .show()
            true
        }
    }

    override fun onResume() {
        super.onResume()
        tick.run()
    }

    override fun onPause() {
        handler.removeCallbacks(tick)
        super.onPause()
    }

    // ---------- permisos y arranque ----------

    private fun askPermissions() {
        val need = ArrayList<String>()
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            need.add(Manifest.permission.RECORD_AUDIO)
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
            need.add(Manifest.permission.ACCESS_FINE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) need.add(Manifest.permission.POST_NOTIFICATIONS)
        if (need.isEmpty()) startListening() else requestPermissions(need.toTypedArray(), 1)
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, res: IntArray) {
        super.onRequestPermissionsResult(code, perms, res)
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            startListening()
        } else {
            Toast.makeText(this, "Sin permiso de micrófono no puedo escuchar", Toast.LENGTH_LONG).show()
        }
    }

    private fun startListening() {
        startForegroundService(Intent(this, ListenService::class.java))
        handler.postDelayed({ refresh() }, 400)
    }

    private fun openBatterySettings() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        try {
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                startActivity(
                    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
                )
            } else {
                startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                )
            }
        } catch (_: Exception) {
            startActivity(Intent(Settings.ACTION_SETTINGS))
        }
        Toast.makeText(
            this,
            "Permite inicio automático y actividad en segundo plano, y bloquea la app en recientes",
            Toast.LENGTH_LONG
        ).show()
    }

    // ---------- lista ----------

    private fun bestLoc(): Location? {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null
        val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        var best: Location? = null
        try {
            for (p in lm.getProviders(true)) {
                val l = lm.getLastKnownLocation(p) ?: continue
                if (best == null || l.time > best.time) best = l
            }
        } catch (_: SecurityException) {
        }
        return best
    }

    private fun dist(loc: Location, n: Note): Float {
        val out = FloatArray(1)
        Location.distanceBetween(loc.latitude, loc.longitude, n.lat!!, n.lon!!, out)
        return out[0]
    }

    private fun refresh() {
        status.text = (if (ListenService.running) "● " else "○ ") + ListenService.status +
            (if (NoteSync.lastStatus.isNotEmpty()) "\nTesla Drive: " + NoteSync.lastStatus else "")
        toggle.text = if (ListenService.running) "Detener escucha" else "Activar escucha"

        val sel = cats[filter.selectedItemPosition.coerceAtLeast(0)]
        var l = db.all(if (sel == "todas") null else sel)
        val loc = bestLoc()
        if (byDist && loc != null) {
            l = l.sortedBy { if (it.lat == null) Float.MAX_VALUE else dist(loc, it) }
        }
        notes = l
        val rows = l.map { n ->
            val d = if (loc != null && n.lat != null) {
                val m = dist(loc, n)
                "  📍" + if (m < 1000) "${m.toInt()} m" else String.format(Locale.US, "%.1f km", m / 1000)
            } else if (n.lat != null) "  📍" else ""
            "[${n.cat}] ${fmt.format(Date(n.ts))}$d\n${n.text}"
        }
        if (rows != rendered) {
            rendered = rows
            list.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, rows)
        }
    }
}
