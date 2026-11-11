package com.leco.voicenotes

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

class MainActivity : Activity() {

    private sealed class Row {
        class Header(val title: String) : Row()
        class Item(val n: Note, val dist: Float?) : Row()
    }

    private companion object {
        val C_CARD = 0xFF1A2133.toInt()
        val C_CHIP = 0xFF252E45.toInt()
        val C_DIM = 0xFF9AA6C0.toInt()
        val C_TEXT = 0xFFF2F5FC.toInt()
        val C_ACCENT = 0xFF4C8DFF.toInt()
        val C_GREEN = 0xFF2ECC71.toInt()
        val C_RED = 0xFFE5484D.toInt()
        val C_OFF = 0xFF5B6784.toInt()
        const val DAY = 24L * 3600 * 1000
        const val ALL = "todas"
        val TODAS = CatDef(ALL, "Todas", "📚", 0xFF4C8DFF.toInt(), emptyList(), emptyList())
    }

    private lateinit var db: NoteDb
    private lateinit var subtitle: TextView
    private lateinit var statusText: TextView
    private lateinit var killInfo: TextView
    private lateinit var dot: View
    private lateinit var btnToggle: TextView
    private lateinit var tabsBox: LinearLayout
    private lateinit var sortDate: TextView
    private lateinit var sortNear: TextView
    private lateinit var list: ListView
    private lateinit var empty: View
    private lateinit var emptyTitle: TextView
    private lateinit var pageNotes: View
    private lateinit var pageSettings: View
    private lateinit var navNotes: TextView
    private lateinit var navSettings: TextView

    private val adapter = NotesAdapter()
    private var cats: List<CatDef> = emptyList()
    private var selCat = ALL
    private var byDist = false
    private var lastTabSig = ""
    private var lastSig = ""
    private val hm = SimpleDateFormat("HH:mm", Locale("es"))
    private val dm = SimpleDateFormat("dd/MM HH:mm", Locale("es"))
    private val handler = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            refresh()
            handler.postDelayed(this, 2000)
        }
    }

    // ---------- utilidades visuales ----------

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun rounded(color: Int, r: Int) = GradientDrawable().apply { setColor(color); cornerRadius = dp(r).toFloat() }
    private fun circle(color: Int) = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(color) }
    private fun withAlpha(c: Int, a: Int) = (c and 0x00FFFFFF) or (a shl 24)
    private fun catOf(key: String) = cats.firstOrNull { it.key == key } ?: CatStore.GENERAL_DEF
    private fun lp(top: Int = 0, end: Int = 0) =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            .apply { topMargin = dp(top); marginEnd = dp(end) }

    // ---------- ciclo de vida ----------

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        db = NoteDb(this)
        cats = CatStore.all(this)

        subtitle = findViewById(R.id.subtitle)
        statusText = findViewById(R.id.status)
        killInfo = findViewById(R.id.killInfo)
        dot = findViewById(R.id.dot)
        btnToggle = findViewById(R.id.btnToggle)
        tabsBox = findViewById(R.id.tabs)
        sortDate = findViewById(R.id.sortDate)
        sortNear = findViewById(R.id.sortNear)
        list = findViewById(R.id.list)
        empty = findViewById(R.id.empty)
        emptyTitle = findViewById(R.id.emptyTitle)
        pageNotes = findViewById(R.id.pageNotes)
        pageSettings = findViewById(R.id.pageSettings)
        navNotes = findViewById(R.id.navNotes)
        navSettings = findViewById(R.id.navSettings)

        findViewById<TextView>(R.id.btnAdd).background = circle(C_CHIP)
        list.adapter = adapter
        list.selector = ColorDrawable(Color.TRANSPARENT)
        list.setOnItemClickListener { _, _, pos, _ ->
            val r = adapter.rows.getOrNull(pos) as? Row.Item ?: return@setOnItemClickListener
            db.toggleDone(r.n.id, !r.n.done)
            lastSig = ""
            refresh()
        }
        list.setOnItemLongClickListener { _, _, pos, _ ->
            val r = adapter.rows.getOrNull(pos) as? Row.Item
            if (r != null) editDialog(r.n)
            true
        }

        btnToggle.setOnClickListener {
            if (ListenService.running) {
                startService(Intent(this, ListenService::class.java).setAction(ListenService.ACTION_STOP))
            } else {
                askPermissions()
            }
            handler.postDelayed({ refresh() }, 500)
        }
        findViewById<View>(R.id.btnAdd).setOnClickListener { addNoteDialog() }
        sortDate.setOnClickListener { byDist = false; lastSig = ""; refresh() }
        sortNear.setOnClickListener {
            if (bestLoc() == null) Toast.makeText(this, "Aún no tengo tu ubicación (activa el GPS y el permiso)", Toast.LENGTH_LONG).show()
            byDist = true; lastSig = ""; refresh()
        }
        navNotes.setOnClickListener { showPage(0) }
        navSettings.setOnClickListener { showPage(1) }

        // Ajustes
        val codeBox = findViewById<EditText>(R.id.code)
        codeBox.setText(NoteSync.code(this))
        findViewById<View>(R.id.codeSave).setOnClickListener {
            val c = codeBox.text.toString().trim()
            if (!NoteSync.valid(c)) {
                Toast.makeText(this, "Código demasiado corto (mínimo 8). Genéralo en Tesla Drive → 📝 → Enlace", Toast.LENGTH_LONG).show()
            } else {
                NoteSync.setCode(this, c)
                db.resetSynced()
                NoteSync.kick(this, db)
                Toast.makeText(this, "Código guardado; enviando notas…", Toast.LENGTH_SHORT).show()
            }
        }
        findViewById<View>(R.id.resend).setOnClickListener {
            db.resetSynced()
            NoteSync.kick(this, db)
            Toast.makeText(this, "Reenviando todas las notas a Tesla Drive…", Toast.LENGTH_SHORT).show()
        }
        findViewById<View>(R.id.battery).setOnClickListener { openBatterySettings() }
        findViewById<View>(R.id.catsBtn).setOnClickListener { manageCats() }
        findViewById<View>(R.id.codeSave).background = rounded(C_ACCENT, 12)
        findViewById<View>(R.id.resend).background = rounded(C_CHIP, 12)
        findViewById<View>(R.id.battery).background = rounded(C_CHIP, 12)
        findViewById<View>(R.id.catsBtn).background = rounded(C_CHIP, 12)

        rebuildHowTo()
        showPage(0)
    }

    override fun onResume() {
        super.onResume()
        recoverListening()
        tick.run()
    }

    override fun onPause() {
        handler.removeCallbacks(tick)
        super.onPause()
    }

    /**
     * Si Android cerró la escucha mientras la app estaba cerrada, lo anotamos (para saber cuántas veces pasa)
     * y la reactivamos solos al abrir la app: así no hace falta tocar el micro.
     */
    private fun recoverListening() {
        if (ListenService.running) return
        val p = ListenService.prefs(this)
        if (p.getBoolean("alive", false)) {
            p.edit().putBoolean("alive", false)
                .putInt("kills", p.getInt("kills", 0) + 1)
                .putLong("lastKill", System.currentTimeMillis()).apply()
            ListenService.event(this, "Android cerró la escucha en segundo plano")
        }
        if (p.getBoolean("want", false) &&
            checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        ) startListening()
    }

    private fun showPage(p: Int) {
        pageNotes.visibility = if (p == 0) View.VISIBLE else View.GONE
        pageSettings.visibility = if (p == 1) View.VISIBLE else View.GONE
        navNotes.setTextColor(if (p == 0) C_ACCENT else C_DIM)
        navSettings.setTextColor(if (p == 1) C_ACCENT else C_DIM)
        navNotes.setTypeface(null, if (p == 0) Typeface.BOLD else Typeface.NORMAL)
        navSettings.setTypeface(null, if (p == 1) Typeface.BOLD else Typeface.NORMAL)
    }

    // ---------- "cómo se usa" ----------

    private fun rebuildHowTo() {
        val a = findViewById<LinearLayout>(R.id.howtoCard)
        a.removeAllViews()
        fillHowTo(a, true)
        val b = findViewById<LinearLayout>(R.id.emptyHowto)
        b.removeAllViews()
        fillHowTo(b, false)
    }

    private fun fillHowTo(box: LinearLayout, withTitle: Boolean) {
        fun line(text: CharSequence, size: Float, color: Int, topDp: Int, bold: Boolean = false) = TextView(this).apply {
            this.text = text
            textSize = size
            setTextColor(color)
            if (bold) setTypeface(null, Typeface.BOLD)
            setLineSpacing(dp(2).toFloat(), 1f)
            layoutParams = lp(topDp)
        }
        if (withTitle) box.addView(line("🎙  Cómo se usa", 16f, C_TEXT, 0, true))
        box.addView(
            line(
                "1. Pulsa el micro de arriba hasta que se ponga verde (solo la primera vez).\n" +
                    "2. Di «oye nota» y espera el pitido.\n" +
                    "3. Dicta la nota. Tras 2 segundos de silencio se guarda y te responde por voz.",
                13f, C_DIM, if (withTitle) 6 else 10
            )
        )
        box.addView(line("Empieza con el nombre de la pestaña:", 13f, C_DIM, 10))
        for (c in cats.filter { it.key != CatStore.GENERAL && it.words.isNotEmpty() }.take(6)) {
            val sb = SpannableStringBuilder("${c.emoji} ${c.label}  ")
            sb.setSpan(ForegroundColorSpan(c.color), 0, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            sb.setSpan(StyleSpan(Typeface.BOLD), 0, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            sb.append("«${c.words.first()} … tu nota»")
            box.addView(line(sb, 14f, C_TEXT, 8))
        }
        box.addView(
            line(
                "Sin palabra clave va a 📝 General. Toca una nota para marcarla como hecha; mantén pulsada para editarla. " +
                    "Cada nota guarda dónde estabas (🧭).",
                12f, C_DIM, 10
            )
        )
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
        ListenService.prefs(this).edit().putBoolean("want", true).apply()
        startForegroundService(Intent(this, ListenService::class.java))
        handler.postDelayed({ refresh() }, 500)
    }

    private fun openBatterySettings() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        try {
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
            } else {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
            }
        } catch (_: Exception) {
            startActivity(Intent(Settings.ACTION_SETTINGS))
        }
    }

    // ---------- diálogos ----------

    private fun field(hint: String, text: String) = EditText(this).apply {
        this.hint = hint
        setText(text)
        setTextColor(C_TEXT)
        setHintTextColor(C_DIM)
        textSize = 15f
        inputType = InputType.TYPE_CLASS_TEXT
    }

    private fun small(text: String) = TextView(this).apply {
        this.text = text
        textSize = 12f
        setTextColor(C_DIM)
        layoutParams = lp(14)
    }

    private fun darkDialog() = AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)

    private fun addNoteDialog() {
        val et = field("Ej.: compra leche y pan", "")
        et.setPadding(dp(20), dp(14), dp(20), dp(14))
        val d = darkDialog()
            .setTitle("Nueva nota")
            .setView(et)
            .setPositiveButton("Guardar") { _, _ ->
                val raw = et.text.toString().trim()
                if (raw.isNotEmpty()) {
                    val (c, content) = Parser.parse(raw, cats)
                    val cat = if (c == CatStore.GENERAL && selCat != ALL) selCat else c
                    val loc = bestLoc()
                    db.insert(content, cat, loc?.latitude, loc?.longitude)
                    NoteSync.kick(this, db)
                    lastSig = ""
                    refresh()
                }
            }
            .setNegativeButton("Cancelar", null)
            .create()
        d.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)
        d.show()
    }

    /** Pulsación larga: cambiar el texto y la pestaña de una nota. */
    private fun editDialog(n: Note) {
        var chosen = n.cat
        val et = field("", n.text).apply {
            setSelection(n.text.length)
            minLines = 2
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        }
        val chipViews = ArrayList<Pair<String, TextView>>()
        fun paint() {
            for ((k, tv) in chipViews) {
                val c = catOf(k)
                val sel = k == chosen
                tv.background = rounded(if (sel) c.color else C_CHIP, 20)
                tv.setTextColor(if (sel) Color.WHITE else C_DIM)
            }
        }
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for (c in cats) {
            val tv = TextView(this).apply {
                text = "${c.emoji} ${c.label}"
                textSize = 14f
                setPadding(dp(12), dp(8), dp(12), dp(8))
                setOnClickListener { chosen = c.key; paint() }
            }
            chipViews.add(c.key to tv)
            row.addView(tv, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginEnd = dp(8) })
        }
        paint()
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
            addView(et)
            addView(HorizontalScrollView(this@MainActivity).apply { isHorizontalScrollBarEnabled = false; addView(row) }, lp(14))
        }
        darkDialog()
            .setTitle("Editar nota")
            .setView(box)
            .setPositiveButton("Guardar") { _, _ ->
                val t = et.text.toString().trim()
                if (t.isEmpty()) {
                    Toast.makeText(this, "La nota no puede quedar vacía", Toast.LENGTH_SHORT).show()
                } else {
                    db.update(n.id, t.replaceFirstChar { it.uppercase() }, chosen)
                    NoteSync.kick(this, db)
                    lastSig = ""
                    refresh()
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun confirmDelete(n: Note) {
        darkDialog()
            .setMessage("¿Borrar esta nota?\n\n${n.text}")
            .setPositiveButton("Borrar") { _, _ -> db.delete(n.id); lastSig = ""; refresh() }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    // ---------- editor de pestañas ----------

    private fun onCatsChanged() {
        cats = CatStore.all(this)
        if (selCat != ALL && cats.none { it.key == selCat }) selCat = ALL
        lastSig = ""
        lastTabSig = ""
        rebuildHowTo()
        refresh()
    }

    private fun manageCats() {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(8), dp(16), dp(8))
        }
        val d = darkDialog()
            .setTitle("Pestañas")
            .setView(ScrollView(this).apply { addView(box) })
            .setNegativeButton("Cerrar", null)
            .create()
        fun row(text: String, bg: Int, fg: Int, onClick: () -> Unit) = TextView(this).apply {
            this.text = text
            textSize = 16f
            setTextColor(fg)
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = rounded(bg, 14)
            setOnClickListener { onClick() }
        }
        box.addView(small("Toca una pestaña para editarla. «General» siempre existe y recoge lo que no encaja."))
        for (c in cats.filter { it.key != CatStore.GENERAL }) {
            box.addView(row("${c.emoji}  ${c.label}", withAlpha(c.color, 0x55), C_TEXT) { d.dismiss(); editCatDialog(c) }, lp(8))
        }
        box.addView(row("＋  Añadir pestaña", C_CHIP, C_ACCENT) { d.dismiss(); editCatDialog(null) }, lp(12))
        d.show()
    }

    private fun splitList(s: String) = s.split(",", ";", "\n").map { it.trim() }.filter { it.isNotEmpty() }.distinct()

    private fun editCatDialog(c: CatDef?) {
        var color = c?.color ?: CatStore.PALETTE[cats.size % CatStore.PALETTE.size]
        val name = field("Nombre (ej.: Sindicato)", c?.label ?: "")
        val emoji = field("Icono (un emoji)", c?.emoji ?: "🏷")
        val words = field("Ej.: sindicato, sindical", c?.words?.joinToString(", ") ?: "")
        val anywhere = field("Opcional. Ej.: reunión sindical", c?.anywhere?.joinToString(", ") ?: "")

        val emojiRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for (e in CatStore.EMOJIS) {
            emojiRow.addView(
                TextView(this).apply {
                    text = e
                    textSize = 22f
                    setPadding(dp(8), dp(4), dp(8), dp(4))
                    setOnClickListener { emoji.setText(e) }
                }
            )
        }
        val colorViews = ArrayList<Pair<Int, View>>()
        fun paintColors() {
            for ((col, v) in colorViews) {
                v.background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(col)
                    if (col == color) setStroke(dp(3), Color.WHITE)
                }
            }
        }
        val colorRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for (col in CatStore.PALETTE) {
            val v = View(this).apply { setOnClickListener { color = col; paintColors() } }
            colorViews.add(col to v)
            colorRow.addView(v, LinearLayout.LayoutParams(dp(36), dp(36)).apply { marginEnd = dp(10) })
        }
        paintColors()

        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(4), dp(20), dp(8))
            addView(small("Nombre de la pestaña"))
            addView(name)
            addView(small("Icono"))
            addView(emoji)
            addView(HorizontalScrollView(this@MainActivity).apply { isHorizontalScrollBarEnabled = false; addView(emojiRow) })
            addView(small("Color"))
            addView(colorRow, lp(4))
            addView(small("Palabras con las que empiezas la nota (separadas por comas). El nombre también cuenta. Usa palabras corrientes: el reconocedor no entiende las inventadas."))
            addView(words)
            addView(small("Palabras que, en cualquier parte de la frase, la meten aquí (el texto se conserva)"))
            addView(anywhere)
        }
        val b = darkDialog()
            .setTitle(if (c == null) "Nueva pestaña" else "Editar pestaña")
            .setView(ScrollView(this).apply { addView(box) })
            .setPositiveButton("Guardar", null)
            .setNegativeButton("Cancelar", null)
        if (c != null) b.setNeutralButton("Borrar", null)
        val d = b.create()
        d.show()

        d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val label = name.text.toString().trim()
            if (label.isEmpty()) {
                Toast.makeText(this, "Ponle un nombre a la pestaña", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val def = CatDef(
                c?.key ?: CatStore.newKey(this, label), label,
                emoji.text.toString().trim().ifEmpty { "🏷" }.take(8), color,
                splitList(words.text.toString()), splitList(anywhere.text.toString())
            )
            CatStore.upsert(this, def)
            if (c != null) db.resyncCat(c.key) // Tesla Drive recibe el nombre/icono/color nuevos
            NoteSync.kick(this, db)
            d.dismiss()
            onCatsChanged()
        }
        d.getButton(AlertDialog.BUTTON_NEUTRAL)?.setOnClickListener {
            val count = db.all(c!!.key).size
            darkDialog()
                .setMessage("Se borrará la pestaña «${c.label}».\n" + (if (count > 0) "Sus $count nota(s) pasarán a General." else "No tiene notas."))
                .setPositiveButton("Borrar") { _, _ ->
                    db.reassign(c.key, CatStore.GENERAL)
                    CatStore.remove(this, c.key)
                    NoteSync.kick(this, db)
                    d.dismiss()
                    onCatsChanged()
                }
                .setNegativeButton("Cancelar", null)
                .show()
        }
    }

    // ---------- mapa ----------

    /** Con ubicación: navegar hasta ahí. Sin ubicación: buscar el texto de la nota en el mapa. */
    private fun openMap(n: Note) {
        val tries = ArrayList<String>()
        if (n.lat != null && n.lon != null) {
            tries.add("google.navigation:q=${n.lat},${n.lon}")
            tries.add("geo:${n.lat},${n.lon}?q=${n.lat},${n.lon}")
        } else {
            tries.add("geo:0,0?q=${Uri.encode(n.text)}")
        }
        for (u in tries) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)))
                return
            } catch (_: Exception) {
            }
        }
        Toast.makeText(this, "No hay ninguna app de mapas instalada", Toast.LENGTH_SHORT).show()
    }

    // ---------- datos ----------

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

    private fun fmtDist(m: Float) =
        if (m < 1000) "${(m / 10).toInt() * 10} m" else String.format(Locale.US, "%.1f km", m / 1000)

    private fun dayStart(t: Long): Long {
        val c = Calendar.getInstance()
        c.timeInMillis = t
        c.set(Calendar.HOUR_OF_DAY, 0); c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
        return c.timeInMillis
    }

    private fun buildRows(shown: List<Note>, loc: Location?): List<Row> {
        val rows = ArrayList<Row>()
        if (byDist && loc != null) {
            val withLoc = shown.filter { it.lat != null }.map { it to dist(loc, it) }.sortedBy { it.second }
            val noLoc = shown.filter { it.lat == null }
            fun section(title: String, items: List<Pair<Note, Float>>) {
                if (items.isEmpty()) return
                rows.add(Row.Header(title))
                items.forEach { rows.add(Row.Item(it.first, it.second)) }
            }
            section("A menos de 500 m", withLoc.filter { it.second < 500 })
            section("A menos de 5 km", withLoc.filter { it.second in 500f..5000f })
            section("Más lejos", withLoc.filter { it.second > 5000 })
            if (noLoc.isNotEmpty()) {
                rows.add(Row.Header("Sin ubicación"))
                noLoc.forEach { rows.add(Row.Item(it, null)) }
            }
        } else {
            val today = dayStart(System.currentTimeMillis())
            var last = ""
            for (n in shown) {
                val b = when {
                    n.ts >= today -> "Hoy"
                    n.ts >= today - DAY -> "Ayer"
                    n.ts >= today - 6 * DAY -> "Esta semana"
                    else -> "Anteriores"
                }
                if (b != last) { rows.add(Row.Header(b)); last = b }
                rows.add(Row.Item(n, if (loc != null && n.lat != null) dist(loc, n) else null))
            }
        }
        return rows
    }

    private fun buildTabs(counts: Map<String, Int>) {
        tabsBox.removeAllViews()
        val wrap = ViewGroup.LayoutParams.WRAP_CONTENT
        for (c in listOf(TODAS) + cats) {
            val sel = c.key == selCat
            val n = counts[c.key] ?: 0
            val tv = TextView(this).apply {
                text = "${c.emoji} ${c.label}" + if (n > 0) "  $n" else ""
                textSize = 14f
                setPadding(dp(14), dp(9), dp(14), dp(9))
                setTextColor(if (sel) Color.WHITE else C_DIM)
                if (sel) setTypeface(null, Typeface.BOLD)
                background = rounded(if (sel) c.color else C_CHIP, 20)
                setOnClickListener { selCat = c.key; lastSig = ""; refresh() }
            }
            tabsBox.addView(tv, LinearLayout.LayoutParams(wrap, wrap).apply { marginEnd = dp(8) })
        }
        val edit = TextView(this).apply {
            text = "✎ Editar"
            textSize = 14f
            setPadding(dp(14), dp(9), dp(14), dp(9))
            setTextColor(C_ACCENT)
            background = rounded(C_CHIP, 20)
            setOnClickListener { manageCats() }
        }
        tabsBox.addView(edit, LinearLayout.LayoutParams(wrap, wrap).apply { marginEnd = dp(8) })
    }

    private fun refresh() {
        cats = CatStore.all(this)

        // Estado de la escucha
        val running = ListenService.running
        val st = ListenService.status
        statusText.text = st + if (NoteSync.lastStatus.isNotEmpty()) "\n☁ Tesla Drive: ${NoteSync.lastStatus}" else ""
        dot.background = circle(
            when {
                !running -> C_OFF
                st.startsWith("Error") || st.startsWith("No se pudo") -> C_RED
                else -> C_GREEN
            }
        )
        btnToggle.background = circle(if (running) C_GREEN else C_CHIP)
        subtitle.text = if (running) "Escuchando · di «oye nota»" else "Toca el micro para activar la escucha"

        // Cierres de Android (diagnóstico de batería)
        val p = ListenService.prefs(this)
        val kills = p.getInt("kills", 0)
        killInfo.text =
            (if (kills == 0) "Sin cierres detectados por Android."
            else "Android ha cerrado la escucha $kills ${if (kills == 1) "vez" else "veces"} (última: ${dm.format(Date(p.getLong("lastKill", 0L)))}).") +
                (p.getString("lastEvent", null)?.let { "\nÚltimo aviso: $it" } ?: "")

        // Orden
        sortDate.background = rounded(if (!byDist) C_ACCENT else C_CHIP, 16)
        sortNear.background = rounded(if (byDist) C_ACCENT else C_CHIP, 16)
        sortDate.setTextColor(if (!byDist) Color.WHITE else C_DIM)
        sortNear.setTextColor(if (byDist) Color.WHITE else C_DIM)

        // Pestañas con contador
        val all = db.all(null)
        val counts = HashMap<String, Int>()
        counts[ALL] = all.size
        for (n in all) counts[n.cat] = (counts[n.cat] ?: 0) + 1
        val tabSig = selCat + counts.toSortedMap().toString() + cats.joinToString { "${it.key}${it.label}${it.emoji}${it.color}" }
        if (tabSig != lastTabSig) { lastTabSig = tabSig; buildTabs(counts) }

        // Lista
        val shown = if (selCat == ALL) all else all.filter { it.cat == selCat }
        val loc = bestLoc()
        val rows = buildRows(shown, loc)
        val sig = selCat + byDist + cats.joinToString { "${it.key}${it.label}${it.emoji}${it.color}" } + rows.joinToString("|") {
            when (it) {
                is Row.Header -> it.title
                is Row.Item -> "${it.n.id}${it.n.done}${it.n.cat}${it.n.text.hashCode()}${it.dist?.toInt()}"
            }
        }
        if (sig != lastSig) {
            lastSig = sig
            adapter.rows = rows
            adapter.notifyDataSetChanged()
        }
        empty.visibility = if (rows.isEmpty()) View.VISIBLE else View.GONE
        emptyTitle.text = if (all.isEmpty()) "Aún no hay notas" else "No hay notas en esta pestaña"
        findViewById<View>(R.id.emptyHowto).visibility = if (all.isEmpty()) View.VISIBLE else View.GONE
    }

    // ---------- adaptador ----------

    private inner class NotesAdapter : BaseAdapter() {
        var rows: List<Row> = emptyList()

        override fun getCount() = rows.size
        override fun getItem(position: Int): Any = rows[position]
        override fun getItemId(position: Int) = position.toLong()
        override fun getViewTypeCount() = 2
        override fun getItemViewType(position: Int) = if (rows[position] is Row.Header) 0 else 1
        override fun isEnabled(position: Int) = rows[position] is Row.Item

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            return when (val r = rows[position]) {
                is Row.Header -> {
                    val tv = (convertView as? TextView) ?: TextView(this@MainActivity).apply {
                        textSize = 12f
                        setTextColor(C_DIM)
                        setTypeface(null, Typeface.BOLD)
                        letterSpacing = 0.08f
                        setPadding(dp(20), dp(16), dp(20), dp(4))
                    }
                    tv.text = r.title.uppercase()
                    tv
                }
                is Row.Item -> {
                    val v = convertView ?: layoutInflater.inflate(R.layout.item_note, parent, false)
                    bind(v, r)
                    v
                }
            }
        }

        private fun bind(v: View, r: Row.Item) {
            val n = r.n
            val cat = catOf(n.cat)
            val icon = v.findViewById<TextView>(R.id.icon)
            val text = v.findViewById<TextView>(R.id.text)
            val meta = v.findViewById<TextView>(R.id.meta)
            val go = v.findViewById<TextView>(R.id.btnGo)
            val del = v.findViewById<TextView>(R.id.btnDel)

            icon.text = if (n.done) "✅" else cat.emoji
            icon.background = circle(withAlpha(cat.color, if (n.done) 0x22 else 0x55))
            text.text = n.text
            text.paintFlags = if (n.done) text.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
            else text.paintFlags and Paint.STRIKE_THRU_TEXT_FLAG.inv()
            text.alpha = if (n.done) 0.5f else 1f

            val whenTxt = if (n.ts >= dayStart(System.currentTimeMillis())) hm.format(Date(n.ts)) else dm.format(Date(n.ts))
            val sb = SpannableStringBuilder(cat.label.uppercase())
            sb.setSpan(ForegroundColorSpan(cat.color), 0, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            sb.setSpan(StyleSpan(Typeface.BOLD), 0, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            sb.append("  ·  ").append(whenTxt)
            if (r.dist != null) sb.append("  ·  📍 ").append(fmtDist(r.dist)) else if (n.lat != null) sb.append("  ·  📍")
            meta.text = sb

            go.text = if (n.lat != null) "🧭" else "🔎"
            go.setOnClickListener { openMap(n) }
            del.setOnClickListener { confirmDelete(n) }
        }
    }
}
