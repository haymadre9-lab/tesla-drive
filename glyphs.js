'use strict';
/* Iconos dibujados en lugar de caracteres de texto.
   El navegador del Tesla no tiene fuente para muchos símbolos (✕ ↗ ⛶ ⌖ ◀ ▶ ▲ ⏸ ✎ ＋ ☰ …) y los pinta como rectángulos.
   Este módulo sustituye esos caracteres, donde aparezcan en la interfaz, por iconos SVG que se ven igual en cualquier navegador.
   Los emojis a color (📍 🎶 ⭐ …) no se tocan: se ven bien. */

(() => {
  const P = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" ${extra}/></svg>`;
  const ST = 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';
  const FL = 'fill="currentColor"';
  const X = P('M5.5 5.5L18.5 18.5M18.5 5.5L5.5 18.5', ST), CHECK = P('M4.5 12.5l5 5L19.5 7', ST);
  const ICONS = {
    '✕': X, '✖': X, '✘': X, '✗': X,
    '✔': CHECK, '✓': CHECK,
    '↗': P('M7 17L17 7M9 7h8v8', ST), '⛶': P('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5', ST), '⌖': `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5" ${ST}/></svg>`,
    '◀': P('M16 5L7 12l9 7z', FL), '▶': P('M8 5l9 7-9 7z', FL), '▲': P('M12 6l8 12H4z', FL), '▼': P('M12 18L4 6h16z', FL), '▴': P('M12 8l6 9H6z', FL), '▾': P('M12 16L6 7h12z', FL),
    '⏸': P('M8 5v14M16 5v14', ST), '⏹': P('M6 6h12v12H6z', FL), '⏮': P('M6 5v14M18 5L9 12l9 7z', ST), '⏭': P('M18 5v14M6 5l9 7-9 7z', ST),
    '✎': P('M4 20l1-4L16 5l3 3L8 19zM14 7l3 3', ST), '＋': P('M12 5v14M5 12h14', ST), '－': P('M5 12h14', ST),
    '☰': P('M4 6.5h16M4 12h16M4 17.5h16', ST), '⋯': `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>`,
    '✥': P('M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3', ST),
    '↶': P('M9 7L4 12l5 5M4 12h10a6 6 0 010 12', ST), '↺': P('M4 12a8 8 0 108-8M4 4v6h6', ST), '↻': P('M20 12a8 8 0 11-8-8M20 4v6h-6', ST), '↩': P('M9 7L4 12l5 5M4 12h11a5 5 0 015 5v1', ST),
    '★': P('M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2 6.4 20.3l1.2-6.3L3 9.6l6.3-.8z', FL), '☆': P('M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2 6.4 20.3l1.2-6.3L3 9.6l6.3-.8z', ST),
    '⚙': `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" ${ST}/></svg>`,
  };
  const RE = new RegExp('[' + Object.keys(ICONS).join('') + ']', 'g'), TEST = new RegExp('[' + Object.keys(ICONS).join('') + ']');
  const SKIP = /^(SCRIPT|STYLE|TITLE|OPTION|SELECT|TEXTAREA|INPUT|NOSCRIPT|SVG|PATH|CODE|PRE)$/i;
  function fix(root) {
    if (!root || (root.nodeType === 1 && SKIP.test(root.tagName))) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => TEST.test(n.nodeValue) && n.parentNode && !SKIP.test(n.parentNode.tagName) && !(n.parentNode.closest && n.parentNode.closest('svg,script,style,textarea,select')) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    const hits = []; let n; while ((n = w.nextNode())) hits.push(n);
    hits.forEach(t => {
      const s = t.nodeValue, frag = document.createDocumentFragment(); let last = 0, m; RE.lastIndex = 0;
      while ((m = RE.exec(s))) { if (m.index > last) frag.append(s.slice(last, m.index)); const sp = document.createElement('span'); sp.className = 'gi'; sp.setAttribute('aria-hidden', 'true'); sp.dataset.g = m[0]; sp.innerHTML = ICONS[m[0]]; frag.append(sp); last = m.index + 1; }
      if (last < s.length) frag.append(s.slice(last)); t.parentNode.replaceChild(frag, t);
    });
  }
  { const st = document.createElement('style'); st.textContent = '.gi{display:inline-block;width:1.05em;height:1.05em;vertical-align:-.17em;line-height:0;flex:none}.gi svg{width:100%;height:100%;display:block}'; document.head.append(st); }
  let busy = false;
  const mo = new MutationObserver(ms => { if (busy) return; busy = true; try { ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) fix(n); else if (n.nodeType === 3 && n.parentNode) fix(n.parentNode); })); } finally { busy = false; } });
  const start = () => { fix(document.body); mo.observe(document.body, { childList: true, subtree: true }); };
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);
  window.Glyphs = { fix, ICONS };
})();
