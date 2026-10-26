#!/usr/bin/env python3
"""Genera tesla_model3_highland_2025.glb (Model 3 Highland Long Range AWD, llantas Photon 18")."""
import sys, os, math
import numpy as np
from glb_lib import *
import body as BD
from body import *
import parts as PT
import lights as LT
import interior as IN

OUT = sys.argv[1] if len(sys.argv) > 1 else 'tesla_model3_highland_2025.glb'

# ------------------------------------------------------------------ materiales
M = {}
def mat(name, **kw): M[name] = Mat(name, **kw); return M[name]
mat('paint', base='#ecedee', metal=0.35, rough=0.30, clearcoat=1.0, ccrough=0.02)
mat('glass', base='#0b1114', alpha=0.24, rough=0.02, metal=0.0, mode='BLEND', double=True)
mat('trim', base='#0a0a0b', rough=0.25, metal=0.0, clearcoat=0.6, double=True)
mat('under', base='#1a1b1d', rough=0.8, double=True)
mat('wheelwell', base='#0e0e0f', rough=0.95, double=True)
mat('tire', base='#0b0b0c', rough=0.92)
mat('rim_metal', base='#c4c7cb', metal=1.0, rough=0.28, double=True)
mat('rim_dark', base='#26282b', metal=0.8, rough=0.45, double=True)
mat('brake_disc', base='#74777b', metal=1.0, rough=0.45, double=True)
mat('caliper', base='#2b2d30', metal=0.5, rough=0.4)
mat('cap', base='#15161a', metal=0.6, rough=0.35)
mat('lamp_lens', base='#08090b', rough=0.05, metal=0.0, clearcoat=1.0, ccrough=0.0)
mat('lamp_red', base='#3a0507', rough=0.08, clearcoat=1.0, ccrough=0.0)
mat('led_off', base='#b9c4cc', rough=0.35, metal=0.2)
mat('led_red_off', base='#5a0d10', rough=0.3)
mat('amber_off', base='#5a2a06', rough=0.3)
mat('beam_off', base='#9aa3aa', rough=0.15, metal=0.9)
mat('reverse_off', base='#c9ccd0', rough=0.2)
mat('drl_on', base='#101418', emissive='#dff1ff', estrength=3.0, rough=0.2)
mat('beam_on', base='#101418', emissive='#fff4dc', estrength=4.0, rough=0.2)
mat('amber_on', base='#201000', emissive='#ff7a00', estrength=3.0, rough=0.2)
mat('tail_on', base='#200000', emissive='#ff1208', estrength=1.6, rough=0.2)
mat('brake_on', base='#200000', emissive='#ff0a05', estrength=3.0, rough=0.2)
mat('reverse_on', base='#101010', emissive='#ffffff', estrength=3.0, rough=0.2)
mat('door_card', base='#2a2c30', rough=0.7, double=True)
mat('door_edge', base='#0b0b0c', rough=0.8, double=True)
mat('beam_cone', base='#ffffff', alpha=1.0, mode='BLEND', double=True, unlit=True)
mat('carpet', base='#101113', rough=1.0)
mat('liner', base='#0d0e10', rough=0.9, double=True)
mat('dash', base='#2b2d31', rough=0.75, sheen='#44464a')
mat('plastic_dark', base='#1c1d20', rough=0.5)
mat('ambient', base='#bcd8ff', emissive='#a9c8ff', estrength=1.6, rough=0.4)
mat('screen_bezel', base='#050506', rough=0.25)
mat('mirror_glass', base='#0a0d10', metal=0.9, rough=0.05)
mat('steer_leather', base='#0e0e10', rough=0.55)
mat('steer_hub', base='#151618', rough=0.45)
mat('chrome', base='#d4d7da', metal=1.0, rough=0.12)
mat('seat', base='#1e1f22', rough=0.5, sheen='#4a4b50')
mat('console', base='#202226', rough=0.6)
mat('console_gloss', base='#101114', rough=0.3, clearcoat=0.4, ccrough=0.15)
mat('rubber', base='#050505', rough=0.95)
_tex = IN.ui_textures()
_t1 = None

# ------------------------------------------------------------------ carrocería
G = build_grid(); zs = G['zs']; nz = G['nz']
def st(z): return int(np.argmin(np.abs(zs - z)))
def mirror_x(m): return xform(m, scl(-1, 1, 1))

DOORS = {'FL': (+1, -0.11, 0.70), 'FR': (-1, -0.11, 0.70), 'RL': (+1, -1.05, -0.11), 'RR': (-1, -1.05, -0.11)}

def cells_mesh(mask, side):
    base = sub_mesh(G, 0, nz - 1, 0, K, side)
    m2 = np.concatenate([mask.reshape(-1), mask.reshape(-1)])
    out = Mesh(base.P, base.F[m2], base.N, X=base.X)
    return compact(out) if len(out.F) else out

zc_ = (zs[:-1] + zs[1:]) / 2
ZC, JC = np.meshgrid(zc_, np.arange(K), indexing='ij')
door_c = np.zeros((nz - 1, K), bool)
for name, (side, za, zb) in DOORS.items():
    door_c[st(za):st(zb), V_SILL:V_ROOF] = True

def carve(rest, conds):
    inside = rest; leftovers = []
    for f in conds:
        if inside.empty(): break
        out, inside = split_mesh(inside, f(inside.X)); leftovers.append(out)
    return inside, concat(leftovers)

zA = lambda U: 0.86 - 0.66 * U
def classify_upper(mesh):
    """Devuelve {(material, puerta|None): malla}. puerta = 'F'/'R' para piezas que pertenecen a las puertas."""
    res = {}
    if mesh.empty(): return res
    rest = mesh
    def take(name, conds, door=None):
        nonlocal rest
        got, rest = carve(rest, conds)
        res.setdefault((name, door), []).append(got)
    sideP, roofP = split_mesh(rest, rest.X[:, 1] - 1.0)
    rest = sideP
    take('trim', [lambda X: 0.045 - X[:, 1]], 'D')                                                                    # moldura cintura
    take('trim', [lambda X: X[:, 1] - 0.955], 'D')                                                                    # moldura techo
    take('glass', [lambda X: X[:, 0] - (zA(X[:, 1]) + 0.03), lambda X: (0.975 - 0.115 * (1 - X[:, 1])) - X[:, 0]])    # parabrisas (lateral)
    take('trim', [lambda X: X[:, 0] - (zA(X[:, 1]) - 0.03), lambda X: (zA(X[:, 1]) + 0.03) - X[:, 0]])               # pilar A
    take('trim', [lambda X: X[:, 0] - 0.60, lambda X: (zA(X[:, 1]) - 0.03) - X[:, 0]])                                # triángulo retrovisor
    take('glass', [lambda X: X[:, 0] + 0.045, lambda X: 0.60 - X[:, 0]], 'D')                                         # luna puerta delantera
    take('trim', [lambda X: X[:, 0] + 0.185, lambda X: -0.045 - X[:, 0]])                                             # pilar B
    take('glass', [lambda X: X[:, 0] - (-1.00 + 0.20 * X[:, 1]), lambda X: -0.185 - X[:, 0]], 'D')                    # luna puerta trasera
    take('trim', [lambda X: X[:, 0] + 1.07, lambda X: -0.185 - X[:, 0]], 'D')                                         # marco trasero
    take('glass', [lambda X: -1.12 - X[:, 0], lambda X: X[:, 0] - (-1.50 + 0.45 * X[:, 1]), lambda X: X[:, 1] - 0.05, lambda X: 0.80 - X[:, 1]])
    res.setdefault(('paint', None), []).append(rest)
    rest = roofP
    take('trim', [lambda X: 1.04 - X[:, 1], lambda X: X[:, 0] + 1.97, lambda X: 0.23 - X[:, 0]])
    take('glass', [lambda X: X[:, 0] - 0.228, lambda X: 0.975 - X[:, 0]])
    take('trim', [lambda X: X[:, 0] - 0.172, lambda X: 0.228 - X[:, 0]])
    take('glass', [lambda X: X[:, 0] + 1.20, lambda X: 0.172 - X[:, 0]])
    take('trim', [lambda X: X[:, 0] + 1.26, lambda X: -1.20 - X[:, 0]])
    take('glass', [lambda X: X[:, 0] + 1.97, lambda X: -1.26 - X[:, 0]])
    res.setdefault(('paint', None), []).append(rest)
    return {k: concat(v) for k, v in res.items()}

def cut_arch(mesh, zc, sgn):
    """Elimina de la malla la zona del paso de rueda (D convexa) para x>0.55."""
    if mesh.empty(): return mesh
    zt = mesh.P[mesh.F][:, :, 2]
    near = (zt.max(1) > zc - ARCH_R - 1e-4) & (zt.min(1) < zc + ARCH_R + 1e-4)
    if not near.any(): return mesh
    far = compact(Mesh(mesh.P, mesh.F[~near], mesh.N, X=mesh.X)) if (~near).any() else None
    mesh = compact(Mesh(mesh.P, mesh.F[near], mesh.N, X=mesh.X))
    keep = [far] if far is not None else []; inside = mesh
    f0 = sgn * inside.P[:, 0] - 0.55
    out, inside = split_mesh(inside, f0); keep.append(out)
    for a in np.linspace(0, np.pi, 61):
        if inside.empty(): break
        nz_, ny_ = np.cos(a), np.sin(a)
        f = ARCH_R - ((inside.P[:, 2] - zc) * nz_ + (inside.P[:, 1] - YC) * ny_)
        out, inside = split_mesh(inside, f); keep.append(out)
    return concat(keep)

def cut_arches(mesh, sgn):
    for zc in (AXF, AXR): mesh = cut_arch(mesh, zc, sgn)
    return mesh

def wheelhouse(sgn):
    """Pasos de rueda: túnel interior + pared interna (negro)."""
    meshes = []
    for zc in (AXF, AXR):
        ang = np.linspace(np.pi, 0, 61)
        path = [(zc - ARCH_R, 0.27), (zc - ARCH_R, YC)] + [(zc + (ARCH_R + 0.004) * np.cos(a), YC + (ARCH_R + 0.004) * np.sin(a)) for a in ang] + [(zc + ARCH_R, 0.27)]
        xs = np.linspace(0.55, 0.935, 4)
        Pg = np.array([[[x, y, z] for x in xs] for z, y in path])
        meshes.append(grid(Pg))
        # pared interna plana (abanico)
        c = np.array([0.55, 0.40, zc]); ring_ = np.array([[0.55, y, z] for z, y in path])
        Pw = np.vstack([c[None], ring_]); n = len(ring_)
        F = np.array([[0, i + 1, i + 2] for i in range(n - 1)])
        meshes.append(with_normals(Mesh(Pw, F)))
    m = concat(meshes)
    return mirror_x(m) if sgn < 0 else m

def body_pieces():
    out = {'paint': [], 'glass': [], 'trim': [], 'under': [], 'wheelwell': []}
    door_upper_pieces = {}
    for side in (1, -1):
        free = ~door_c
        under = (JC < 4) & free
        upper = (JC >= V_BELT) & free
        lower = free & ~under & ~upper
        out['under'].append(cut_arches(cells_mesh(under, side), side))
        out['paint'].append(cut_arches(cells_mesh(lower, side), side))
        cls = classify_upper(cells_mesh(upper, side))
        for (k, d), v in cls.items(): out[k].append(v)
        out['wheelwell'].append(wheelhouse(side))
        # zonas de puerta: lo que NO es de puerta pasa a la carrocería
        for name, (sd, za, zb) in DOORS.items():
            if sd != side: continue
            i0, i1 = st(za), st(zb)
            cls = classify_upper(sub_mesh(G, i0, i1, V_BELT, V_ROOF, side))
            for (k, d), v in cls.items():
                if d is None: out[k].append(v)
    return {k: concat(v) for k, v in out.items()}

BODY = body_pieces()
for k, v in BODY.items(): v.X = None
LAMPS = LT.Lamps()
BODY['paint'] = LT.build_lamps(BODY['paint'], LAMPS)

# ------------------------------------------------------------------ puertas
HINGE = {}
def build_door(name):
    side, za, zb = DOORS[name]
    i0, i1 = st(za), st(zb)
    Psh = shrunk_positions(G, i0, i1, V_SILL, V_ROOF, 0.0045)
    low = sub_mesh(G, i0, i1, V_SILL, V_BELT, side, P=Psh)
    up = sub_mesh(G, i0, i1, V_BELT, V_ROOF, side, P=Psh)
    parts = {'paint': [low], 'glass': [], 'trim': [], 'door_card': [], 'door_edge': []}
    cls = classify_upper(up)
    for (k, d), v in cls.items():
        if d == 'D': parts[k].append(v)
    # espesor / panel interior de la parte baja
    back, walls = extrude_surface(compact(Mesh(low.P, low.F, low.N)), -0.075 * low.N)
    parts['door_card'].append(back)
    if walls is not None: parts['door_edge'].append(walls)
    # bisagra: borde delantero de la puerta
    zh = zs[i0 if name[0] == 'R' else i1] if False else (zb if name[0] == 'F' else zb)
    return parts, side, za, zb

DOOR_PARTS = {}
for n in DOORS: DOOR_PARTS[n] = build_door(n)


# ------------------------------------------------------------------ detalles (manillas, retrovisores, tarjetas de puerta, cámaras)
def surf_frame(z, V, side=1):
    p, n = sample(G, z, V, 1)
    ex = n / np.linalg.norm(n); ez = np.array([0, 0, 1.0]); ez = ez - (ez @ ex) * ex; ez /= np.linalg.norm(ez)
    ey = np.cross(ez, ex)
    Mx = np.eye(4); Mx[:3, 0] = ex; Mx[:3, 1] = ey; Mx[:3, 2] = ez; Mx[:3, 3] = p
    return Mx

def door_extras(kind):
    """Piezas de la puerta izquierda (kind 'F' o 'R') en coordenadas del coche. -> {material: [mallas]}"""
    d = {}
    def put(m, mesh): d.setdefault(m, []).append(mesh)
    za, zb = (-0.11, 0.70) if kind == 'F' else (-1.05, -0.11)
    zm = (za + zb) / 2
    # tarjeta interior
    Fa = surf_frame(zm - 0.02, 20.5)
    put('door_card', xform(rbox((0.075, 0.055, 0.36 if kind == 'F' else 0.34), 0.022, 3), Fa @ trans(-0.045, 0, 0)))                    # reposabrazos
    put('plastic_dark', xform(rbox((0.012, 0.014, 0.17), 0.005, 2), surf_frame(zm - 0.17, 24.0) @ trans(-0.066, 0, 0)))                  # tirador interior
    put('chrome', xform(rbox((0.004, 0.006, 0.15), 0.002, 1), surf_frame(zm - 0.17, 24.0) @ trans(-0.058, 0, 0)))
    put('ambient', xform(rbox((0.005, 0.005, 0.46), 0.002, 1), surf_frame(zm - 0.02, 22.7) @ trans(-0.071, 0, 0)))                      # luz ambiente
    put('plastic_dark', xform(cylinder(0.060, 0.010, 'x', 28), surf_frame(zm + 0.02, 11.0) @ trans(-0.070, 0, 0)))                      # altavoz
    put('plastic_dark', xform(rbox((0.012, 0.020, 0.085), 0.004, 1), surf_frame(zm + (0.18 if kind == 'F' else 0.10), 21.2) @ trans(-0.074, 0, 0)))  # mando elevalunas
    # manilla exterior (enrasada)
    zh = 0.0 if kind == 'F' else -0.90
    Fh = surf_frame(zh, 21.0)
    put('trim', xform(rbox((0.006, 0.036, 0.170), 0.003, 1), Fh @ trans(0.0, 0, 0)))
    put('paint', xform(rbox((0.012, 0.024, 0.150), 0.010, 2), Fh @ trans(0.001, 0, 0)))
    return d

DOOR_EXTRA = {'F': door_extras('F'), 'R': door_extras('R')}

def side_mirror():
    p0, n0 = sample(G, 0.585, V_BELT + 3.0, 1)
    d = {}
    c = p0 + np.array([0.115, 0.045, -0.03])
    d['paint'] = [rbox((0.115, 0.118, 0.205), 0.048, 5, tuple(c))]
    d['mirror_glass'] = [rbox((0.092, 0.086, 0.004), 0.002, 1, (c[0], c[1] + 0.004, c[2] - 0.1042))]
    d['plastic_dark'] = [rbox((0.080, 0.032, 0.060), 0.012, 2, tuple(p0 + np.array([0.040, 0.018, -0.005]))),
                         rbox((0.110, 0.018, 0.180), 0.008, 2, tuple(c + np.array([0, -0.054, 0.0])))]
    return d
MIRROR = side_mirror()

def tub_walls(side):
    i0, i1 = st(-1.05), st(0.70)
    m = sub_mesh(G, i0, i1, V_SILL, V_BELT, side)
    m.X = None
    return flip(Mesh(m.P - m.N * 0.10, m.F, m.N))

def side_cams():
    out = {}
    for side in (1, -1):
        Fc = surf_frame(0.985, 23.0)
        parts = [('plastic_dark', xform(rbox((0.020, 0.030, 0.070), 0.010, 3), Fc @ trans(0.004, 0, 0))),
                 ('lamp_lens', xform(rbox((0.003, 0.016, 0.050), 0.0015, 1), Fc @ trans(0.0140, 0.0, 0.0)))]
        on = ('amber_on', xform(rbox((0.0036, 0.007, 0.044), 0.0015, 1), Fc @ trans(0.0150, -0.003, 0.0)))
        off = ('amber_off', xform(rbox((0.0034, 0.007, 0.044), 0.0015, 1), Fc @ trans(0.0148, -0.003, 0.0)))
        if side < 0: parts = [(k, mirror_x(m)) for k, m in parts]; on = (on[0], mirror_x(on[1])); off = (off[0], mirror_x(off[1]))
        out[side] = (parts + [off], on)
    return out
SIDECAMS = side_cams()

# ------------------------------------------------------------------ escena
g = GLB()
car = g.node('Tesla_Model3_Highland_2025')
g.node('Carroceria', car, parts=[(M[k], BODY[k]) for k in ('paint', 'glass', 'trim', 'under', 'wheelwell')])
def _upper_only(m_):
    c = m_.P[m_.F].mean(1); keep = (c[:, 1] > 0.86) | (c[:, 2] < -2.0)
    return compact(Mesh(m_.P, m_.F[keep], m_.N))
_liner = concat([tub_walls(1), tub_walls(-1), flip(LT.lift(_upper_only(BODY['paint']), -0.012))])
g.node('Carroceria_interior', car, parts=[(M['liner'], _liner)])

DOOR_ANGLE = {'FL': -64, 'FR': 64, 'RL': -62, 'RR': 62}
door_nodes = {}
for n, (parts, side, za, zb) in DOOR_PARTS.items():
    hz = zb if n[0] == 'F' else zb       # borde delantero = z mayor
    p, _ = sample(G, hz, (V_SILL + V_BELT) / 2, side)
    H = np.array([p[0] - side * 0.02, 0.0, hz])
    pv = g.node(f'Puerta_{n}', car, t=H)
    plist = []
    for k, v in parts.items():
        merged = concat(v)
        if merged.empty(): continue
        merged.X = None
        merged = xform(merged, trans(-H[0], -H[1], -H[2]))
        plist.append((M[k], merged))
    kind = n[0]
    ex_items = []
    for km, ms in DOOR_EXTRA[kind].items():
        for m in ms: ex_items.append((km, mirror_x(m) if side < 0 else m))
    if n[0] == 'F':
        for km, ms in MIRROR.items():
            for m in ms: ex_items.append((km, mirror_x(m) if side < 0 else m))
    for km, m in ex_items:
        plist.append((M[km], xform(m, trans(-H[0], -H[1], -H[2]))))
    g.node(f'Puerta_{n}_malla', pv, parts=plist)
    door_nodes[n] = (pv, H)

# interior
_t_main = g.add_image(_tex[0]); _t_rear = g.add_image(_tex[1])
mat('screen_main', base='#050506', emissive='#ffffff', estrength=1.0, rough=0.15, base_tex=None, em_tex=_t_main)
mat('screen_rear', base='#050506', emissive='#ffffff', estrength=1.0, rough=0.15, em_tex=_t_rear)
INT = IN.build_interior(M)
g.node('Interior', car, parts=[(M[k], m) for k, m in INT])

# emblemas
def tbadge(center, facing):
    bar = rbox((0.050, 0.009, 0.004), 0.0015, 1, (0, 0.012, 0)); stem = rbox((0.010, 0.036, 0.004), 0.0015, 1, (0, -0.010, 0))
    mt = concat([bar, stem])
    mt = xform(mt, rot_y(math.pi)) if facing < 0 else mt
    return xform(mt, trans(*center))
g.node('Emblema_T_delantero', car, parts=[(M['chrome'], tbadge((0, 0.565, 2.334), +1))])
g.node('Emblema_T_trasero', car, parts=[(M['chrome'], tbadge((0, 0.78, -2.394), -1))])

# luces
lights = g.node('Luces', car)
g.node('Luces_apagadas', lights, parts=[(M[k], m) for k, m in LAMPS.static])
for side, (pts, on) in SIDECAMS.items():
    sfx = 'L' if side > 0 else 'R'
    g.node(f'Camara_lateral_{sfx}', lights, parts=[(M[k], m) for k, m in pts])
    LAMPS.on(f'TurnSide_{sfx}', on[0], on[1])
toggle_nodes = {}
for nm, items in LAMPS.toggles.items():
    toggle_nodes[nm] = g.node(nm, lights, sc=(1e-4, 1e-4, 1e-4), parts=[(M[k], m) for k, m in items])

# ruedas (una sola malla compartida por las 4)
wheel_parts = PT.build_wheel_parts(M)
wheel_mesh = g.mesh_from('Rueda_Photon_18', wheel_parts)
WHEELS = {'FL': (+1, 0.795, AXF), 'FR': (-1, -0.795, AXF), 'RL': (+1, 0.800, AXR), 'RR': (-1, -0.800, AXR)}
wheel_nodes = {}
for n, (side, x, z) in WHEELS.items():
    pv = g.node(f'Rueda_{n}', car, t=(x, TIRE_R, z))
    g.node(f'Rueda_{n}_malla', pv, q=(quat((0, 1, 0), math.pi) if side < 0 else None), mesh_index=wheel_mesh)
    wheel_nodes[n] = pv

# animación de ruedas (giro continuo)
_tt = [0, 0.25, 0.5, 0.75, 1.0]
g.animation('Ruedas_Girar', [(pv, 'rotation', _tt, [quat((1, 0, 0), a) for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2, 2 * math.pi)], 'LINEAR') for pv in wheel_nodes.values()])

# animaciones de puertas
def ease(n=9):
    t = np.linspace(0, 1, n); return t, 0.5 - 0.5 * np.cos(np.pi * t)
for n, (pv, H) in door_nodes.items():
    t, e = ease()
    ang = np.radians(DOOR_ANGLE[n])
    g.animation(f'Puerta_{n}_abrir', [(pv, 'rotation', t * 1.2, [quat((0, 1, 0), ang * k) for k in e], 'LINEAR')])

def blink(period=1.0, duty=0.5):
    return [0, period * duty, period], [[1, 1, 1], [1e-4] * 3, [1e-4] * 3], 'STEP'
def clip_on(name, nodes):
    g.animation(name, [(toggle_nodes[n], 'scale', [0, 1.0], [[1, 1, 1], [1, 1, 1]], 'STEP') for n in nodes])
def clip_blink(name, nodes):
    t, v, i = blink(); g.animation(name, [(toggle_nodes[n], 'scale', t, v, i) for n in nodes])
clip_on('Luces_DRL', ['DRL_L', 'DRL_R'])
clip_on('Luces_Cortas', ['LowBeam_L', 'LowBeam_R'])
clip_on('Luces_Largas', ['HighBeam_L', 'HighBeam_R'])
clip_on('Luces_Posicion_Traseras', ['Tail_L', 'Tail_R'])
clip_on('Luces_Freno', ['Brake_L', 'Brake_R'])
clip_on('Luces_MarchaAtras', ['Reverse_L', 'Reverse_R'])
clip_blink('Intermitente_Izquierdo', ['TurnFront_L', 'TurnRear_L', 'TurnSide_L'])
clip_blink('Intermitente_Derecho', ['TurnFront_R', 'TurnRear_R', 'TurnSide_R'])
clip_blink('Warning_Emergencia', ['TurnFront_L', 'TurnRear_L', 'TurnSide_L', 'TurnFront_R', 'TurnRear_R', 'TurnSide_R'])
g.write(OUT)
print('GLB escrito', OUT, os.path.getsize(OUT) // 1024, 'KB')
# variante con las luces de noche encendidas (DRL + cortas + posición), útil para visores sin soporte de animaciones
for nm, idx in toggle_nodes.items():
    if nm.startswith(('DRL_', 'LowBeam_', 'Tail_')): g.nodes[idx]['scale'] = [1.0, 1.0, 1.0]
OUT2 = OUT.replace('.glb', '_luces_encendidas.glb')
g.write(OUT2)
print('GLB escrito', OUT2, os.path.getsize(OUT2) // 1024, 'KB')
