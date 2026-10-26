"""Mini-biblioteca: mallas, primitivas y escritor GLB (glTF 2.0) sin dependencias salvo numpy."""
import json, math, struct
import numpy as np

# ----------------------------------------------------------------------------- math
def pchip(xs, ys):
    xs = np.asarray(xs, float); ys = np.asarray(ys, float)
    h = np.diff(xs); d = np.diff(ys) / h; n = len(xs)
    m = np.zeros(n)
    for k in range(1, n - 1):
        if d[k - 1] * d[k] > 0:
            w1 = 2 * h[k] + h[k - 1]; w2 = h[k] + 2 * h[k - 1]
            m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k])
    def end(h0, h1, d0, d1):
        v = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
        if np.sign(v) != np.sign(d0): v = 0.0
        elif np.sign(d0) != np.sign(d1) and abs(v) > 3 * abs(d0): v = 3 * d0
        return v
    m[0] = end(h[0], h[1], d[0], d[1]); m[-1] = end(h[-1], h[-2], d[-1], d[-2])
    def f(x):
        x = np.asarray(x, float)
        idx = np.clip(np.searchsorted(xs, x) - 1, 0, n - 2)
        t = (x - xs[idx]) / h[idx]
        return ((2*t**3 - 3*t**2 + 1) * ys[idx] + (t**3 - 2*t**2 + t) * h[idx] * m[idx]
                + (-2*t**3 + 3*t**2) * ys[idx + 1] + (t**3 - t**2) * h[idx] * m[idx + 1])
    return f

def catmull(pts, sub):
    """Catmull-Rom (centripetal-ish uniform) por puntos de control; sub[i] = subdivisiones del tramo i."""
    pts = np.asarray(pts, float); n = len(pts)
    out = []; idx = []
    for i in range(n - 1):
        p0 = pts[max(i - 1, 0)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(i + 2, n - 1)]
        for k in range(sub[i]):
            t = k / sub[i]
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2*p0 - 5*p1 + 4*p2 - p3) * t**2 + (-p0 + 3*p1 - 3*p2 + p3) * t**3))
            idx.append(i + t)
    out.append(pts[-1]); idx.append(n - 1)
    return np.array(out), np.array(idx)

def rot_x(a): c, s = math.cos(a), math.sin(a); return np.array([[1,0,0,0],[0,c,-s,0],[0,s,c,0],[0,0,0,1]], float)
def rot_y(a): c, s = math.cos(a), math.sin(a); return np.array([[c,0,s,0],[0,1,0,0],[-s,0,c,0],[0,0,0,1]], float)
def rot_z(a): c, s = math.cos(a), math.sin(a); return np.array([[c,-s,0,0],[s,c,0,0],[0,0,1,0],[0,0,0,1]], float)
def trans(x, y=None, z=None):
    if y is None: x, y, z = x
    m = np.eye(4); m[:3, 3] = (x, y, z); return m
def scl(x, y=None, z=None):
    if y is None: y = z = x
    return np.diag([x, y, z, 1.0])
def quat(axis, ang):
    a = np.asarray(axis, float); a = a / np.linalg.norm(a); s = math.sin(ang / 2)
    return [a[0]*s, a[1]*s, a[2]*s, math.cos(ang / 2)]

def srgb(hexcol, a=1.0):
    if isinstance(hexcol, str):
        h = hexcol.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    else: c = list(hexcol)
    lin = [(v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return lin + [a]

# ----------------------------------------------------------------------------- mesh
class Mesh:
    def __init__(s, P, F, N=None, UV=None, C=None, X=None):
        s.P = np.asarray(P, float).reshape(-1, 3); s.F = np.asarray(F, np.int64).reshape(-1, 3)
        s.N = None if N is None else np.asarray(N, float).reshape(-1, 3)
        s.UV = None if UV is None else np.asarray(UV, float).reshape(-1, 2)
        s.C = None if C is None else np.asarray(C, float).reshape(len(s.P), -1)
        s.X = None if X is None else np.asarray(X, float).reshape(len(s.P), -1)
    def copy(s):
        return Mesh(s.P.copy(), s.F.copy(), None if s.N is None else s.N.copy(), None if s.UV is None else s.UV.copy(),
                    None if s.C is None else s.C.copy(), None if s.X is None else s.X.copy())
    def empty(s): return len(s.F) == 0

def face_normals_acc(P, F):
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    fn = np.cross(b - a, c - a)
    N = np.zeros_like(P)
    for k in range(3): np.add.at(N, F[:, k], fn)
    l = np.linalg.norm(N, axis=1, keepdims=True)
    return np.where(l > 1e-14, N / np.maximum(l, 1e-14), np.array([0, 1.0, 0]))

def with_normals(m):
    m.N = face_normals_acc(m.P, m.F); return m

def concat(ms):
    ms = [m for m in ms if m is not None and not m.empty()]
    if not ms: return Mesh(np.zeros((0, 3)), np.zeros((0, 3), np.int64))
    P = np.vstack([m.P for m in ms]); off = np.cumsum([0] + [len(m.P) for m in ms[:-1]])
    F = np.vstack([m.F + o for m, o in zip(ms, off)])
    def cat(attr):
        vals = [getattr(m, attr) for m in ms]
        if any(v is None for v in vals): return None
        return np.vstack(vals)
    return Mesh(P, F, cat('N'), cat('UV'), cat('C'), cat('X'))

def xform(m, M, copy=True):
    M = np.asarray(M, float); R = M[:3, :3]
    r = m.copy() if copy else m
    r.P = m.P @ R.T + M[:3, 3]
    if m.N is not None:
        Nm = np.linalg.inv(R).T; n = m.N @ Nm.T
        l = np.linalg.norm(n, axis=1, keepdims=True); r.N = n / np.maximum(l, 1e-14)
    if np.linalg.det(R) < 0: r.F = r.F[:, [0, 2, 1]]
    return r

def flip(m):
    r = m.copy(); r.F = r.F[:, [0, 2, 1]]
    if r.N is not None: r.N = -r.N
    return r

def compact(m):
    used = np.unique(m.F)
    remap = -np.ones(len(m.P), np.int64); remap[used] = np.arange(len(used))
    return Mesh(m.P[used], remap[m.F], None if m.N is None else m.N[used], None if m.UV is None else m.UV[used],
                None if m.C is None else m.C[used], None if m.X is None else m.X[used])

def split_mesh(m, f):
    """Parte la malla por f (valor por vértice, afín). Devuelve (neg, pos). Interpola todos los atributos."""
    f = np.asarray(f, float)
    if len(m.F) == 0: return m, m
    fv = f[m.F]; pos = fv > 0
    npos = pos.sum(1)
    allpos = npos == 3; allneg = npos == 0
    mixed = np.where(~(allpos | allneg))[0]
    attrs = ['P', 'N', 'UV', 'C', 'X']
    cur = {a: getattr(m, a) for a in attrs}
    newv = {a: [] for a in attrs if cur[a] is not None}
    nbase = len(m.P); counter = [0]
    def newvert(i0, i1, t):
        for a in newv:
            arr = cur[a]; newv[a].append(arr[i0] * (1 - t) + arr[i1] * t)
        counter[0] += 1; return nbase + counter[0] - 1
    Fp = [m.F[allpos]]; Fn = [m.F[allneg]]
    pp = []; nn = []
    for t in mixed:
        v = m.F[t]; s = pos[t]
        # vértice solitario
        if s.sum() == 1: lone = int(np.argmax(s)); lone_pos = True
        else: lone = int(np.argmin(s)); lone_pos = False
        a = v[lone]; b = v[(lone + 1) % 3]; c = v[(lone + 2) % 3]
        fa, fb, fc = f[a], f[b], f[c]
        t1 = fa / (fa - fb); t2 = fa / (fa - fc)
        p1 = newvert(a, b, t1); p2 = newvert(a, c, t2)
        tri_lone = [a, p1, p2]; quad = [[p1, b, c], [p1, c, p2]]
        if lone_pos: pp.append(tri_lone); nn.extend(quad)
        else: nn.append(tri_lone); pp.extend(quad)
    if pp: Fp.append(np.array(pp, np.int64))
    if nn: Fn.append(np.array(nn, np.int64))
    def build(Fs):
        F = np.vstack(Fs) if Fs else np.zeros((0, 3), np.int64)
        d = {}
        for a in attrs:
            if cur[a] is None: d[a] = None
            else: d[a] = np.vstack([cur[a]] + [np.array(newv[a])]) if newv[a] else cur[a]
        r = Mesh(d['P'], F, d['N'], d['UV'], d['C'], d['X'])
        if r.N is not None:
            l = np.linalg.norm(r.N, axis=1, keepdims=True); r.N = r.N / np.maximum(l, 1e-14)
        return compact(r) if len(F) else Mesh(d['P'][:0], F)
    return build(Fn), build(Fp)

def cut_polygon_xy(m, poly, axes=(0, 1), use='P'):
    """Recorta m con un polígono CONVEXO (ccw) en el plano de los ejes dados de P. Devuelve (dentro, fuera_lista)."""
    inside = m; outs = []
    n = len(poly)
    for i in range(n):
        p = np.array(poly[i]); q = np.array(poly[(i + 1) % n])
        e = q - p; nrm = np.array([-e[1], e[0]])      # apunta hacia dentro (ccw)
        f = (getattr(inside, use)[:, axes[0]] - p[0]) * nrm[0] + (getattr(inside, use)[:, axes[1]] - p[1]) * nrm[1]
        out, inside = split_mesh(inside, f)
        outs.append(out)
        if inside.empty(): break
    return inside, outs

def grid(P, wrap=False, flip_=False, close_v=False):
    """P: (nu,nv,3). u = índice 0, v = índice 1. Normal ~ e_v x e_u si flip_ False."""
    P = np.asarray(P, float); nu, nv = P.shape[:2]
    idx = np.arange(nu * nv).reshape(nu, nv)
    ui = list(range(nu - 1)) + ([nu - 1] if wrap else [])
    vi = list(range(nv - 1)) + ([nv - 1] if close_v else [])
    F = []
    for i in ui:
        i2 = (i + 1) % nu
        for j in vi:
            j2 = (j + 1) % nv
            a, b, c, d = idx[i, j], idx[i, j2], idx[i2, j2], idx[i2, j]
            F.append([a, b, c]); F.append([a, c, d])
    F = np.array(F, np.int64)
    if flip_: F = F[:, [0, 2, 1]]
    return with_normals(Mesh(P.reshape(-1, 3), F))

def grid_faces(nu, nv, flip_=False):
    idx = np.arange(nu * nv).reshape(nu, nv)
    a = idx[:-1, :-1]; b = idx[:-1, 1:]; c = idx[1:, 1:]; d = idx[1:, :-1]
    F = np.concatenate([np.stack([a, b, c], -1).reshape(-1, 3), np.stack([a, c, d], -1).reshape(-1, 3)])
    # orden por celda (a,b,c),(a,c,d) -> reordenar para que cell k tenga ambas consecutivas (no necesario)
    return F[:, [0, 2, 1]] if flip_ else F

def lathe(profile, n=64, flip_=False):
    """Revoluciona perfil [(axial,radio),...] alrededor del eje X. Recorrer en sentido horario (a→derecha, r→arriba)
    => normal exterior a la izquierda. Esquinas duras: repetir el punto."""
    prof = np.asarray(profile, float)
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    P = np.zeros((n, len(prof), 3))
    P[:, :, 0] = prof[None, :, 0]
    P[:, :, 1] = prof[None, :, 1] * np.cos(th)[:, None]
    P[:, :, 2] = prof[None, :, 1] * np.sin(th)[:, None]
    return grid(P, wrap=True, flip_=not flip_)

def circle_profile(cx, cr, r, n=16, a0=90, a1=-270):
    t = np.radians(np.linspace(a0, a1, n))
    return [(cx + r * np.cos(x), cr + r * np.sin(x)) for x in t]

def cylinder(r, length, axis='y', n=32, caps=True, r2=None):
    r2 = r if r2 is None else r2
    prof = []
    if caps: prof += [(-length / 2, 0.0)]
    prof += [(-length / 2, r)] + ([(-length / 2, r)] if caps else []) + [(length / 2, r2)] + ([(length / 2, r2)] if caps else [])
    if caps: prof += [(length / 2, 0.0)]
    # perfil horario: eje X; ajustar sentido (arriba izq->der)
    # inicio en eje, subir, avanzar, bajar = horario ✓.
    m = lathe(prof if caps else prof, n)
    # lathe en X; reorientar
    if axis == 'y': m = xform(m, rot_z(np.pi / 2))
    elif axis == 'z': m = xform(m, rot_y(-np.pi / 2))
    return m

def rbox(size, r=0.01, seg=4, center=(0, 0, 0)):
    h = np.asarray(size, float) / 2; r = min(r, h.min() * 0.999)
    t = np.linspace(0, np.pi / 2, seg + 1)
    def S(hh):
        return np.concatenate([-hh + r * (1 - np.cos(t)), (hh - r) + r * np.sin(t)])
    meshes = []
    for ax in range(3):
        for sgn in (-1, 1):
            a1, a2 = [k for k in range(3) if k != ax]
            A = S(h[a1]); B = S(h[a2])
            AA, BB = np.meshgrid(A, B, indexing='ij')
            p = np.zeros(AA.shape + (3,)); p[..., a1] = AA; p[..., a2] = BB; p[..., ax] = sgn * h[ax]
            inner = np.clip(p, -(h - r), h - r); d = p - inner
            l = np.linalg.norm(d, axis=-1, keepdims=True)
            fn = np.zeros(3); fn[ax] = sgn
            nrm = np.where(l > 1e-12, d / np.maximum(l, 1e-12), fn)
            pos = inner + nrm * r
            nu, nv = AA.shape
            F = grid_faces(nu, nv)
            m = Mesh(pos.reshape(-1, 3), F, nrm.reshape(-1, 3))
            # orientación: asegurar normal geométrica ≈ nrm
            fnn = np.cross(m.P[F[:, 1]] - m.P[F[:, 0]], m.P[F[:, 2]] - m.P[F[:, 0]])
            if (fnn * m.N[F[:, 0]]).sum() < 0: m.F = m.F[:, [0, 2, 1]]
            meshes.append(m)
    out = concat(meshes); out.P = out.P + np.asarray(center, float); return out

def weld_key(P, tol=1e-5):
    return np.round(P / tol).astype(np.int64)

def extrude_surface(m, offset, inner_mesh=None):
    """Devuelve (cara trasera desplazada, paredes) para dar espesor a una superficie.
       offset: (n,3) desplazamiento por vértice (o escalar*normal)."""
    off = np.asarray(offset, float)
    if off.ndim == 0: off = m.N * float(off)
    back = flip(Mesh(m.P + off, m.F, m.N))
    # aristas frontera
    key = weld_key(m.P); _, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel()
    E = np.concatenate([m.F[:, [0, 1]], m.F[:, [1, 2]], m.F[:, [2, 0]]])
    Ew = np.sort(inv[E], axis=1)
    _, first, cnt = np.unique(Ew, axis=0, return_index=True, return_counts=True)
    bidx = first[cnt == 1]
    walls = []
    for e in bidx:
        a, b = E[e]
        p0, p1, q1, q0 = m.P[a], m.P[b], m.P[b] + off[b], m.P[a] + off[a]
        walls.append(([p0, p1, q1, q0]))
    if not walls: return back, None
    W = np.array(walls)  # (k,4,3)
    k = len(W)
    P = W.reshape(-1, 3); base = np.arange(k) * 4
    F = np.concatenate([np.stack([base, base + 1, base + 2], 1), np.stack([base, base + 2, base + 3], 1)])
    wm = Mesh(P, F)
    # normales planas por cara
    fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    fn = fn / np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-14)
    N = np.zeros_like(P); N[F[:k, 0]] = fn[:k]; N[F[:k, 1]] = fn[:k]; N[F[:k, 2]] = fn[:k]; N[base + 3] = fn[:k]
    wm.N = N
    return back, wm

# ----------------------------------------------------------------------------- glTF
class Mat:
    def __init__(s, name, base='#ffffff', alpha=1.0, metal=0.0, rough=0.5, emissive=None, estrength=None, mode='OPAQUE',
                 double=False, clearcoat=None, ccrough=0.05, base_tex=None, em_tex=None, ior=None, specular=None, sheen=None, unlit=False):
        s.__dict__.update(locals()); del s.__dict__['s']

class GLB:
    def __init__(s):
        s.nodes = []; s.meshes = []; s.materials = []; s.matidx = {}; s.images = []; s.textures = []
        s.buf = bytearray(); s.views = []; s.accessors = []; s.animations = []; s.roots = []
        s.samplers = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}]
    # -- buffers
    def _view(s, data, target=None):
        while len(s.buf) % 4: s.buf.append(0)
        off = len(s.buf); s.buf += data
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target: v["target"] = target
        s.views.append(v); return len(s.views) - 1
    def _acc(s, arr, ctype, atype, target=None, minmax=False):
        arr = np.ascontiguousarray(arr)
        bv = s._view(arr.tobytes(), target)
        a = {"bufferView": bv, "componentType": ctype, "count": int(len(arr)), "type": atype}
        if minmax:
            a["min"] = [float(x) for x in arr.min(0)]; a["max"] = [float(x) for x in arr.max(0)]
        s.accessors.append(a); return len(s.accessors) - 1
    def add_image(s, png_bytes):
        bv = s._view(png_bytes)
        s.images.append({"bufferView": bv, "mimeType": "image/png"})
        s.textures.append({"sampler": 0, "source": len(s.images) - 1}); return len(s.textures) - 1
    # -- materiales
    def material(s, m):
        if m.name in s.matidx: return s.matidx[m.name]
        pbr = {"baseColorFactor": srgb(m.base, m.alpha), "metallicFactor": m.metal, "roughnessFactor": m.rough}
        if m.base_tex is not None: pbr["baseColorTexture"] = {"index": m.base_tex}; pbr["baseColorFactor"] = [1, 1, 1, m.alpha]
        d = {"name": m.name, "pbrMetallicRoughness": pbr}
        ext = {}
        if m.emissive is not None:
            d["emissiveFactor"] = srgb(m.emissive)[:3]
            if m.em_tex is not None: d["emissiveTexture"] = {"index": m.em_tex}; d["emissiveFactor"] = [1, 1, 1]
            if m.estrength: ext["KHR_materials_emissive_strength"] = {"emissiveStrength": m.estrength}
        if m.mode != 'OPAQUE': d["alphaMode"] = m.mode
        if m.double: d["doubleSided"] = True
        if m.clearcoat: ext["KHR_materials_clearcoat"] = {"clearcoatFactor": m.clearcoat, "clearcoatRoughnessFactor": m.ccrough}
        if m.ior: ext["KHR_materials_ior"] = {"ior": m.ior}
        if m.specular is not None: ext["KHR_materials_specular"] = {"specularFactor": m.specular}
        if m.sheen: ext["KHR_materials_sheen"] = {"sheenColorFactor": srgb(m.sheen)[:3], "sheenRoughnessFactor": 0.5}
        if m.unlit: ext["KHR_materials_unlit"] = {}
        if ext: d["extensions"] = ext
        s.materials.append(d); s.matidx[m.name] = len(s.materials) - 1; return s.matidx[m.name]
    # -- mallas
    def mesh_from(s, name, parts):
        """parts: lista de (Mat, Mesh)"""
        prims = []
        for mat, m in parts:
            if m is None or m.empty(): continue
            if m.N is None: with_normals(m)
            P = m.P.astype(np.float32); N = m.N.astype(np.float32)
            at = {"POSITION": s._acc(P, 5126, "VEC3", 34962, True), "NORMAL": s._acc(N, 5126, "VEC3", 34962)}
            if m.UV is not None: at["TEXCOORD_0"] = s._acc(m.UV.astype(np.float32), 5126, "VEC2", 34962)
            if m.C is not None: at["COLOR_0"] = s._acc(m.C.astype(np.float32), 5126, "VEC4" if m.C.shape[1] == 4 else "VEC3", 34962)
            F = m.F.astype(np.uint32).reshape(-1)
            ia = s._acc(F, 5125, "SCALAR", 34963)
            prims.append({"attributes": at, "indices": ia, "material": s.material(mat), "mode": 4})
        if not prims: return None
        s.meshes.append({"name": name, "primitives": prims}); return len(s.meshes) - 1
    def node(s, name, parent=None, t=None, q=None, sc=None, parts=None, extras=None, mesh_name=None, mesh_index=None):
        d = {"name": name}
        if t is not None: d["translation"] = [float(x) for x in t]
        if q is not None: d["rotation"] = [float(x) for x in q]
        if sc is not None: d["scale"] = [float(x) for x in sc]
        if mesh_index is not None: d["mesh"] = mesh_index
        elif parts:
            mi = s.mesh_from(mesh_name or name, parts)
            if mi is not None: d["mesh"] = mi
        if extras: d["extras"] = extras
        s.nodes.append(d); i = len(s.nodes) - 1
        if parent is None: s.roots.append(i)
        else:
            s.nodes[parent].setdefault("children", []).append(i)
        return i
    # -- animación
    def animation(s, name, chans):
        """chans: (node, path, times, values, interp)"""
        samplers = []; channels = []
        for node, path, times, values, interp in chans:
            tin = s._acc(np.array(times, np.float32).reshape(-1, 1)[:, 0:1].reshape(-1), 5126, "SCALAR", None, False)
            s.accessors[tin]["min"] = [float(min(times))]; s.accessors[tin]["max"] = [float(max(times))]
            v = np.array(values, np.float32)
            tout = s._acc(v, 5126, "VEC4" if path == "rotation" else "VEC3")
            samplers.append({"input": tin, "output": tout, "interpolation": interp})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": node, "path": path}})
        s.animations.append({"name": name, "samplers": samplers, "channels": channels})
    def write(s, path, extras=None, asset_extra=None):
        present = set()
        for m in s.materials: present |= set(m.get("extensions", {}).keys())
        j = {"asset": {"version": "2.0", "generator": "model3-highland-procedural"},
             "scene": 0, "scenes": [{"name": "Scene", "nodes": s.roots}], "nodes": s.nodes,
             "meshes": s.meshes, "materials": s.materials, "accessors": s.accessors, "bufferViews": s.views,
             "buffers": [{"byteLength": len(s.buf)}], "extensionsUsed": sorted(present)}
        if asset_extra: j["asset"]["extras"] = asset_extra
        if s.images: j["images"] = s.images; j["textures"] = s.textures; j["samplers"] = s.samplers
        if s.animations: j["animations"] = s.animations
        js = json.dumps(j, separators=(',', ':')).encode()
        while len(js) % 4: js += b' '
        binb = bytes(s.buf)
        while len(binb) % 4: binb += b'\0'
        total = 12 + 8 + len(js) + 8 + len(binb)
        with open(path, 'wb') as f:
            f.write(struct.pack('<4sII', b'glTF', 2, total))
            f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
            f.write(struct.pack('<I4s', len(binb), b'BIN\0')); f.write(binb)
        return total
