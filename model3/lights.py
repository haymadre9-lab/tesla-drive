"""Faros, pilotos, intermitentes: recortes sobre la superficie de la carrocería (estado apagado + capas emisivas 'on')."""
import numpy as np
from glb_lib import *

def sub(m, mask):
    if not mask.any(): return Mesh(m.P[:0], m.F[:0])
    return compact(Mesh(m.P, m.F[mask], m.N, m.UV, m.C, m.X))

def extract(mesh, poly, axes=(0, 1), conds=()):
    """Devuelve (parche, resto). poly: polígono convexo ccw en los ejes (axes) de P; conds: funciones afines f(P)>0 dentro."""
    if mesh.empty(): return mesh, mesh
    tri = mesh.P[mesh.F]; pa = np.array(poly); lo = pa.min(0) - 1e-4; hi = pa.max(0) + 1e-4
    A = tri[:, :, axes[0]]; B = tri[:, :, axes[1]]
    sel = (A.max(1) >= lo[0]) & (A.min(1) <= hi[0]) & (B.max(1) >= lo[1]) & (B.min(1) <= hi[1])
    for f in conds: sel &= (f(mesh.P)[mesh.F].max(1) > 0)
    if not sel.any(): return Mesh(mesh.P[:0], mesh.F[:0]), mesh
    near = sub(mesh, sel); far = sub(mesh, ~sel)
    inside = near; outs = [far]
    for f in conds:
        out, inside = split_mesh(inside, f(inside.P)); outs.append(out)
        if inside.empty(): break
    if not inside.empty():
        inside, o2 = cut_polygon_xy(inside, poly, axes); outs += o2
    return inside, concat(outs)

def lift(m, d):
    r = m.copy(); r.P = r.P + r.N * d; r.X = None; return r

def mpoly(poly): return [(-x, y) for x, y in poly][::-1]

def inset(poly, k):
    p = np.array(poly); c = p.mean(0); return [tuple(c + k * (q - c)) for q in p]

class Lamps:
    """Acumula piezas: static -> [(mat, mesh)]; toggles -> {nodo: [(mat, mesh)]}"""
    def __init__(s): s.static = []; s.toggles = {}
    def on(s, name, mat, mesh):
        s.toggles.setdefault(name, []).append((mat, mesh))

def beam_cone(origin, direction, length, half_angle_deg, alpha0=0.30, n=28):
    fr = np.array([0.0, 0.06, 0.2, 0.45, 0.75, 1.0]); al = alpha0 * np.array([1.0, 0.85, 0.55, 0.28, 0.10, 0.0])
    t = np.tan(np.radians(half_angle_deg)); th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    P = np.zeros((n, len(fr), 3)); C = np.ones((n, len(fr), 4))
    for j, f in enumerate(fr):
        P[:, j, 0] = length * f * t * np.cos(th); P[:, j, 1] = length * f * t * np.sin(th); P[:, j, 2] = length * f
        C[:, j, :3] = [1.0, 0.95, 0.80]; C[:, j, 3] = al[j]
    m = grid(P, wrap=True); m.C = C.reshape(-1, 4)
    d = np.asarray(direction, float); d = d / np.linalg.norm(d)
    R = np.eye(4); z = np.array([0, 0, 1.0]); v = np.cross(z, d); c = float(z @ d)
    if np.linalg.norm(v) > 1e-9:
        vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); R[:3, :3] = np.eye(3) + vx + vx @ vx * (1 / (1 + c))
    return xform(m, trans(*origin) @ R)

def build_lamps(paint, L):
    """paint: malla de pintura (se devuelve sin los recortes). L: instancia Lamps."""
    FRONT = [lambda P: P[:, 2] - 1.88]
    REAR = [lambda P: -2.0 - P[:, 2]]
    top = lambda x: 0.595 + 0.23 * (x - 0.22)
    bot = lambda x: 0.522 + 0.30 * (x - 0.22)
    def band(x0, x1, lo, hi):
        f = lambda ref, off, x: (top(x) - off) if ref == 't' else (bot(x) + off)
        return [(x0, f(*lo, x0)), (x1, f(*lo, x1)), (x1, f(*hi, x1)), (x0, f(*hi, x0))]
    fb, paint = extract(paint, [(-1.2, 0.0), (1.2, 0.0), (1.2, 0.42), (-1.2, 0.42)], (0, 1), [lambda P: P[:, 2] - 1.95])
    L.static.append(('under', fb))
    rb, paint = extract(paint, [(-1.2, 0.0), (1.2, 0.0), (1.2, 0.46), (-1.2, 0.46)], (0, 1), [lambda P: -2.05 - P[:, 2]])
    L.static.append(('under', rb))
    for side in (+1, -1):
        sfx = 'L' if side > 0 else 'R'
        M = (lambda p: p) if side > 0 else mpoly
        # ---- delantero
        lens, paint = extract(paint, M([(0.22, 0.522), (0.80, 0.696), (0.80, 0.729), (0.22, 0.595)]), (0, 1), FRONT)
        L.static.append(('lamp_lens', lift(lens, 0.0015)))
        def el(poly): return extract(lens, M(poly), (0, 1), FRONT)[0]
        drl = el(band(0.22, 0.80, ('t', 0.0085), ('t', 0.0015)))
        turn = el(band(0.50, 0.80, ('b', 0.002), ('b', 0.0085)))
        hb = el(band(0.27, 0.38, ('b', 0.007), ('t', 0.011)))
        lb = el(band(0.40, 0.51, ('b', 0.006), ('t', 0.011)))
        L.static += [('led_off', lift(drl, 0.0025)), ('amber_off', lift(turn, 0.0025)), ('beam_off', lift(hb, 0.0025)), ('beam_off', lift(lb, 0.0025))]
        L.on(f'DRL_{sfx}', 'drl_on', lift(drl, 0.0040)); L.on(f'TurnFront_{sfx}', 'amber_on', lift(turn, 0.0040))
        L.on(f'HighBeam_{sfx}', 'beam_on', lift(hb, 0.0040)); L.on(f'LowBeam_{sfx}', 'beam_on', lift(lb, 0.0040))
        ox = 0.50 * side
        L.on(f'LowBeam_{sfx}', 'beam_cone', beam_cone((ox, 0.64, 2.25), (0.04 * side, -0.06, 1.0), 8.0, 13, 0.13))
        L.on(f'HighBeam_{sfx}', 'beam_cone', beam_cone((ox * 0.75, 0.64, 2.25), (0.0, -0.012, 1.0), 18.0, 6, 0.11))
        # ---- trasero: lámpara exterior
        lamp_poly = [(0.46, 0.872), (0.70, 0.805), (0.78, 0.835), (0.78, 0.905), (0.74, 0.935), (0.46, 0.902)]
        lamp, paint = extract(paint, M(lamp_poly), (0, 1), REAR)
        L.static.append(('lamp_red', lift(lamp, 0.0015)))
        def er(poly, src=None): return extract(src if src is not None else lamp, M(poly), (0, 1), REAR)[0]
        # luz de posición: franja superior de la lámpara + barra central
        run = er([(0.46, 0.893), (0.74, 0.926), (0.74, 0.934), (0.46, 0.901)])
        brake = er(inset(lamp_poly, 0.90))
        l = lambda x: 0.872 + (0.805 - 0.872) * (x - 0.46) / 0.24
        tr = er([(0.47, l(0.47) + 0.006), (0.69, l(0.69) + 0.006), (0.69, l(0.69) + 0.020), (0.47, l(0.47) + 0.020)])
        L.static += [('led_red_off', lift(run, 0.0025)), ('amber_off', lift(tr, 0.0025))]
        L.on(f'Tail_{sfx}', 'tail_on', lift(run, 0.0040)); L.on(f'Brake_{sfx}', 'brake_on', lift(brake, 0.0038))
        L.on(f'TurnRear_{sfx}', 'amber_on', lift(tr, 0.0042))
        # barra central (mitad)
        bar, paint = extract(paint, M([(0.0, 0.872), (0.46, 0.872), (0.46, 0.902), (0.0, 0.902)]) if side > 0 else M([(0.0, 0.872), (0.46, 0.872), (0.46, 0.902), (0.0, 0.902)]), (0, 1), REAR)
        L.static.append(('lamp_red', lift(bar, 0.0015)))
        L.static.append(('led_red_off', lift(bar, 0.0025)))
        L.on(f'Tail_{sfx}', 'tail_on', lift(bar, 0.0040)); L.on(f'Brake_{sfx}', 'brake_on', lift(bar, 0.0038))
        # marcha atrás (parachoques)
        rev, paint = extract(paint, M([(0.26, 0.50), (0.44, 0.50), (0.44, 0.535), (0.26, 0.535)]), (0, 1), REAR)
        L.static.append(('reverse_off', lift(rev, 0.0015))); L.on(f'Reverse_{sfx}', 'reverse_on', lift(rev, 0.0030))
    # tercera luz de freno (techo del maletero)
    ch, paint = extract(paint, [(-0.16, -2.285), (0.16, -2.285), (0.16, -2.262), (-0.16, -2.262)], (0, 2), [lambda P: P[:, 1] - 0.95])
    L.static.append(('led_red_off', lift(ch, 0.0015))); L.on('Brake_L', 'brake_on', lift(ch, 0.0030))
    return paint
