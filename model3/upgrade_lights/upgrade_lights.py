#!/usr/bin/env python3
"""Mejora luces e intermitentes de un GLB de Tesla Model 3 (probado con 'Tesla 2018 Model 3' de Ameer Studio, CC-BY 4.0).

Trabaja a nivel JSON/glTF: no toca la geometría original. Por cada luz crea un nodo gemelo 'ON' (material emisivo)
que comparte la malla; los clips alternan el nodo apagado/encendido (escala ~0 / 1).
Uso: python3 -I upgrade_lights.py entrada.glb salida.glb
"""
import sys, os, copy, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from gltfio import *

TINY = [1e-4] * 3
src, dst = sys.argv[1], sys.argv[2]
j, b = load(src)
par = parents(j)
mats = j['materials']; mname = {m.get('name'): i for i, m in enumerate(mats)}
ext_used = set(j.get('extensionsUsed', []))

# ------------------------------------------------------------------ materiales
def clear_emissive(name):
    m = mats[mname[name]]; m.pop('emissiveFactor', None); m.pop('emissiveTexture', None)

def make_on(name, tint, strength, textured=True, base=None):
    m = copy.deepcopy(mats[mname[name]]); m['name'] = name + '__ON'
    pbr = m['pbrMetallicRoughness']
    pbr['baseColorFactor'] = base if base is not None else [0.06, 0.06, 0.06, 1.0]   # solo debe verse el emisivo
    m['emissiveFactor'] = list(tint)
    if textured and 'baseColorTexture' in pbr: m['emissiveTexture'] = copy.deepcopy(pbr['baseColorTexture'])
    else: m.pop('emissiveTexture', None)
    m['extensions'] = {'KHR_materials_emissive_strength': {'emissiveStrength': strength}}
    ext_used.add('KHR_materials_emissive_strength')
    mats.append(m); mname[m['name']] = len(mats) - 1; return m['name']

# Las luces del original brillan siempre (emisivo fijo) y son incoherentes entre sí -> todas apagadas por defecto
for n in ('right_rear_light', 'left_front_light', 'light_night', 'indicator_lf', 'indicator_rf', 'pantulans.0', 'light_pantulan.0'):
    off_src = copy.deepcopy(mats[mname[n]]) if n in ('left_front_light', 'light_night', 'indicator_lf', 'indicator_rf', 'right_rear_light') else None
    clear_emissive(n)
mats[mname['light_night']]['pbrMetallicRoughness']['baseColorFactor'] = [0.12, 0.12, 0.12, 1.0]
mats[mname['indicator_lr']]['pbrMetallicRoughness']['baseColorFactor'] = [0.42, 0.17, 0.03, 1.0]   # el original era verde lima

AMBER = (1.0, 0.42, 0.02); RED = (1.0, 0.0, 0.0); WHITE = (1.0, 0.96, 0.88); ICE = (0.72, 0.88, 1.0)
# función -> (materiales origen, tinte, intensidad, texturado)
FUNCS = {
    'DRL_L':       (['left_front_light'], ICE, 8.0, True),
    'DRL_R':       (['right_front_light'], ICE, 8.0, True),
    'LowBeam':     (['aluminium_light.0'], WHITE, 6.0, True),
    'HighBeam':    (['aluminium_light.0'], WHITE, 12.0, True),
    'Fog':         (['foglight_l', 'foglight_r'], (1.0, 0.85, 0.5), 8.0, True),
    'TurnFront_L': (['indicator_lf'], AMBER, 10.0, False),
    'TurnFront_R': (['indicator_rf'], AMBER, 10.0, False),
    'Tail':        (['right_rear_light', 'left_rear_light'], RED, 1.2, True),
    'Brake':       (['breaklight_l'], RED, 3.0, True),
    'Reverse':     (['revlight_L'], WHITE, 6.0, True),
    'TurnRear_L':  (['indicator_lr'], AMBER, 6.0, False),
    'TurnRear_R':  (['indicator_rr'], AMBER, 6.0, False),
    'CabinLight':  (['light_night'], (1.0, 0.95, 0.85), 3.0, True),
}
# el material de los 'indicator_*' traseros no tiene textura: emisivo uniforme
ON = {}
for fn, (srcs, tint, k, tex) in [(k_, v_) for k_, v_ in FUNCS.items() if v_]:
    ON[fn] = {s: make_on(s, tint, k, tex) for s in srcs}

# lente (semitransparente, tapa los LED): al encender se aclara
lens = copy.deepcopy(mats[mname['tembus_red.0']]); lens['name'] = 'tembus_red.0__ON'; lens['pbrMetallicRoughness']['baseColorFactor'][3] = 0.16
mats.append(lens); mname[lens['name']] = len(mats) - 1
ON['Lens'] = {'tembus_red.0': 'tembus_red.0__ON'}
FUNCS['Lens'] = None

# ------------------------------------------------------------------ nodos gemelos ON
def prim_mat_names(mesh_i): return [mats[p['material']]['name'] for p in j['meshes'][mesh_i]['primitives'] if 'material' in p]
pair = {fn: [] for fn in ON}         # fn -> [(nodo_off, nodo_on)]
orig_nodes = list(range(len(j['nodes'])))
for i in orig_nodes:
    n = j['nodes'][i]
    if 'mesh' not in n: continue
    names = prim_mat_names(n['mesh'])
    for fn, d in ON.items():
        hit = [s for s in d if s in names]
        if not hit: continue
        mesh2 = copy.deepcopy(j['meshes'][n['mesh']]); mesh2['name'] += '__ON_' + fn
        for p in mesh2['primitives']:
            mn = mats[p['material']]['name']
            if mn in d: p['material'] = mname[d[mn]]
        j['meshes'].append(mesh2)
        node2 = {'name': n['name'] + '__ON_' + fn, 'mesh': len(j['meshes']) - 1, 'scale': TINY}
        j['nodes'].append(node2); k = len(j['nodes']) - 1
        j['nodes'][par[i]].setdefault('children', []).append(k)
        pair[fn].append((i, k))
        if len(names) != 1: print('aviso: malla con varias primitivas', n['name'], names)

# ------------------------------------------------------------------ geometría nueva (repetidores laterales, conos de luz)
def add_accessor(arr, ctype, atype, target=None, minmax=False):
    arr = np.ascontiguousarray(arr)
    while len(b) % 4: b.append(0)
    off = len(b); b.extend(arr.tobytes())
    j['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes, **({'target': target} if target else {})})
    a = {'bufferView': len(j['bufferViews']) - 1, 'componentType': ctype, 'count': len(arr), 'type': atype}
    if minmax: a['min'] = arr.min(0).astype(float).tolist(); a['max'] = arr.max(0).astype(float).tolist()
    j['accessors'].append(a); return len(j['accessors']) - 1

def add_mesh_node(name, P, N, F, material, C=None, parent=None, scale=None):
    at = {'POSITION': add_accessor(P.astype(np.float32), 5126, 'VEC3', 34962, True), 'NORMAL': add_accessor(N.astype(np.float32), 5126, 'VEC3', 34962)}
    if C is not None: at['COLOR_0'] = add_accessor(C.astype(np.float32), 5126, 'VEC4', 34962)
    ia = add_accessor(F.astype(np.uint32).reshape(-1), 5125, 'SCALAR', 34963)
    j['meshes'].append({'name': name, 'primitives': [{'attributes': at, 'indices': ia, 'material': mname[material], 'mode': 4}]})
    node = {'name': name, 'mesh': len(j['meshes']) - 1}
    if scale: node['scale'] = scale
    j['nodes'].append(node); k = len(j['nodes']) - 1
    (j['scenes'][0]['nodes'] if parent is None else j['nodes'][parent].setdefault('children', [])).append(k)
    return k

def new_mat(name, base, alpha=1.0, emissive=None, strength=None, mode=None, unlit=False, rough=0.4):
    m = {'name': name, 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorFactor': list(base) + [alpha], 'metallicFactor': 0.0, 'roughnessFactor': rough}}
    ext = {}
    if emissive: m['emissiveFactor'] = list(emissive)
    if strength: ext['KHR_materials_emissive_strength'] = {'emissiveStrength': strength}; ext_used.add('KHR_materials_emissive_strength')
    if unlit: ext['KHR_materials_unlit'] = {}; ext_used.add('KHR_materials_unlit')
    if ext: m['extensions'] = ext
    if mode: m['alphaMode'] = mode
    mats.append(m); mname[name] = len(mats) - 1

def box(c, s):
    h = np.array(s) / 2; P = []; N = []; F = []
    for ax in range(3):
        for sg in (-1, 1):
            a1, a2 = [k for k in range(3) if k != ax]
            base = len(P)
            for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                p = np.zeros(3); p[ax] = sg * h[ax]; p[a1] = u * h[a1]; p[a2] = v * h[a2]; P.append(p + c); n = np.zeros(3); n[ax] = sg; N.append(n)
            F += [[base, base + 1, base + 2], [base, base + 2, base + 3]] if sg > 0 else [[base, base + 2, base + 1], [base, base + 3, base + 2]]
    return np.array(P), np.array(N), np.array(F)

def cone(origin, direction, length, half_deg, alpha0, n=32):
    fr = np.array([0, .06, .2, .45, .75, 1.0]); al = alpha0 * np.array([1, .85, .55, .28, .1, 0.0]); t = math.tan(math.radians(half_deg))
    d = np.array(direction, float); d /= np.linalg.norm(d)
    u = np.cross(d, [0, 1, 0]); u /= np.linalg.norm(u); v = np.cross(d, u)
    P = []; C = []; N = []; th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    for k in range(n):
        for f, a in zip(fr, al):
            r = length * f * t; P.append(np.array(origin) + d * length * f + u * r * math.cos(th[k]) + v * r * math.sin(th[k])); C.append([1, .95, .8, a]); N.append(-d)
    F = []
    for k in range(n):
        k2 = (k + 1) % n
        for jx in range(len(fr) - 1):
            a, b_, c, d_ = k * 6 + jx, k * 6 + jx + 1, k2 * 6 + jx + 1, k2 * 6 + jx
            F += [[a, b_, c], [a, c, d_]]
    return np.array(P), np.array(N), np.array(F), np.array(C)

new_mat('SideRepeater_OFF', (0.35, 0.14, 0.02), rough=0.3)
new_mat('SideRepeater_ON', (0.1, 0.04, 0.0), emissive=AMBER, strength=5.0)
new_mat('BeamCone', (1, 1, 1), 1.0, mode='BLEND', unlit=True)

# repetidores laterales del guardabarros (el original no los tiene): posición estimada sobre el guardabarros delantero
SIDE = {'L': (-1, np.array([-103.5, 4.0, -126.0])), 'R': (+1, np.array([103.5, 4.0, -126.0]))}
side_nodes = {}
for s, (sg, c) in SIDE.items():
    P, N, F = box(c, [1.2, 2.2, 5.5]); add_mesh_node(f'RepetidorLateral_{s}_apagado', P, N, F, 'SideRepeater_OFF')
    P, N, F = box(c + np.array([sg * 0.1, 0, 0]), [1.2, 2.0, 5.2]); side_nodes[s] = add_mesh_node(f'RepetidorLateral_{s}_ON', P, N, F, 'SideRepeater_ON', scale=TINY)

# conos de luz: desde el centro de cada faro hacia delante (-Z mundo, unidades cm)
beam_nodes = {}
for fn, key, length, ang, a0 in (('LowBeam', 'Low', 900, 14, .12), ('HighBeam', 'High', 1800, 6, .10)):
    ids = []
    for s, nm in (('L', 'chrome_Lights_head_l_left front light_0'), ('R', 'chrome_Lights_head_l_right front light_0')):
        i = [k for k, n in enumerate(j['nodes']) if n.get('name') == nm][0]
        lo, hi = mesh_bbox_world(j, i, par); o = (lo + hi) / 2 + np.array([0, 0, -3])
        P, N, F, C = cone(o, [0.04 * (1 if s == 'R' else -1), -0.05 if key == 'Low' else -0.01, -1], length, ang, a0)
        ids.append(add_mesh_node(f'Cono{key}_{s}', P, N, F, 'BeamCone', C=C, scale=TINY))
    beam_nodes[fn] = ids

# ------------------------------------------------------------------ animaciones
bins_cache = {}
def acc_scalar(times):
    return add_accessor(np.array(times, np.float32), 5126, 'SCALAR', None) 
def acc_vec3(vals): return add_accessor(np.array(vals, np.float32), 5126, 'VEC3', None)
j.setdefault('animations', [])
def anim(name, chans):
    sam = []; ch = []
    for node, times, vals in chans:
        tin = acc_scalar(times); j['accessors'][tin]['min'] = [float(min(times))]; j['accessors'][tin]['max'] = [float(max(times))]
        sam.append({'input': tin, 'output': acc_vec3(vals), 'interpolation': 'STEP'}); ch.append({'sampler': len(sam) - 1, 'target': {'node': node, 'path': 'scale'}})
    j['animations'].append({'name': name, 'samplers': sam, 'channels': ch})
ONV, OFFV = [1, 1, 1], TINY
def static_on(funcs, extra_on=(), extra_off=()):
    ch = []
    for fn in funcs:
        for off, on in pair[fn]: ch += [(off, [0, 1], [OFFV, OFFV]), (on, [0, 1], [ONV, ONV])]
    for n in extra_on: ch.append((n, [0, 1], [ONV, ONV]))
    for n in extra_off: ch.append((n, [0, 1], [OFFV, OFFV]))
    return ch
def blink(funcs, extra_nodes=()):
    ch = []
    for fn in funcs:
        for off, on in pair[fn]: ch += [(off, [0, .5, 1], [OFFV, ONV, ONV]), (on, [0, .5, 1], [ONV, OFFV, OFFV])]
    for n in extra_nodes: ch.append((n, [0, .5, 1], [ONV, OFFV, OFFV]))
    return ch
LENS = ['Lens']
anim('Luces_DRL', static_on(['DRL_L', 'DRL_R'] + LENS))
anim('Luces_Cortas', static_on(['LowBeam'] + LENS, extra_on=beam_nodes['LowBeam']))
anim('Luces_Largas', static_on(['HighBeam'] + LENS, extra_on=beam_nodes['HighBeam'] + beam_nodes['LowBeam'][:0]))
anim('Luces_Antiniebla', static_on(['Fog'] + LENS))
anim('Luces_Posicion_Traseras', static_on(['Tail'] + LENS))
anim('Luces_Freno', static_on(['Brake'] + LENS))
anim('Luces_MarchaAtras', static_on(['Reverse'] + LENS))
anim('Luz_Interior', static_on(['CabinLight']))
anim('Intermitente_Izquierdo', blink(['TurnFront_L', 'TurnRear_L'] + LENS, [side_nodes['L']]))
anim('Intermitente_Derecho', blink(['TurnFront_R', 'TurnRear_R'] + LENS, [side_nodes['R']]))
anim('Warning_Emergencia', blink(['TurnFront_L', 'TurnRear_L', 'TurnFront_R', 'TurnRear_R'] + LENS, [side_nodes['L'], side_nodes['R']]))

j['extensionsUsed'] = sorted(ext_used)
j['asset'].setdefault('extras', {})['modification'] = 'Luces e intermitentes mejorados (nodos ON emisivos + animaciones). Modelo original: Tesla 2018 Model 3 por Ameer Studio, CC-BY-4.0'
save(dst, j, b)
print('escrito', dst, 'clips:', [a['name'] for a in j['animations']])
for fn, p in pair.items(): print(fn, len(p), 'nodos')
