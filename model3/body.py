"""Carrocería del Tesla Model 3 Highland: loft paramétrico + clasificación de superficies."""
import numpy as np
from glb_lib import *

# ---- dimensiones (m). +Z = frente, +X = lado izquierdo (conductor), Y arriba. Origen: suelo, centro entre ejes.
ZF, ZR = 2.33, -2.39          # longitud total 4.72
AXF, AXR = 1.44, -1.44        # batalla 2.88
TIRE_R = 0.3344               # 235/45 R18
ARCH_R = 0.385
YC = TIRE_R

T_ = pchip([-2.39,-2.30,-2.15,-2.00,-1.75,-1.45,-1.10,-0.70,-0.30,0.05,0.20,0.55,0.98,1.15,1.50,1.90,2.20,2.33],
           [0.975,1.030,1.062,1.060,1.14,1.275,1.375,1.430,1.445,1.435,1.415,1.20,0.958,0.945,0.895,0.805,0.705,0.625])
B_ = pchip([-2.39,-2.30,-2.10,-1.80,-1.20,-0.50,0.20,0.75,1.10,1.50,1.90,2.20,2.33],
           [0.890,0.945,0.995,1.015,1.005,0.985,0.975,0.955,0.915,0.865,0.775,0.665,0.595])
YB_ = pchip([-2.39,-2.30,-2.12,-1.90,-1.5,1.5,1.9,2.1,2.25,2.33],
            [0.42,0.33,0.23,0.17,0.15,0.15,0.18,0.22,0.30,0.38])
W0_ = pchip([-2.39,-2.2,-1.9,-1.5,1.4,1.8,2.1,2.33], [0.74,0.82,0.895,0.925,0.925,0.90,0.82,0.74])
TAPER_F = (1.70, 2.8); TAPER_R = (-1.80, 2.6)

def taper(z):
    z = np.asarray(z, float)
    uf = np.clip((z - TAPER_F[0]) / (ZF - TAPER_F[0]), 0, 1)
    ur = np.clip((TAPER_R[0] - z) / (TAPER_R[0] - ZR), 0, 1)
    sf = (1 - uf ** TAPER_F[1]) ** (1 / TAPER_F[1]); sr = (1 - ur ** TAPER_R[1]) ** (1 / TAPER_R[1])
    return sf * sr

SUB = [2, 2, 4, 6, 6, 6, 6, 6, 12]       # subdivisiones por tramo de control
IDX = np.concatenate([[0], np.cumsum(SUB)])  # índices del anillo de cada punto de control
V_SILL, V_BELT, V_ROOF, V_TOP = int(IDX[3]), int(IDX[6]), int(IDX[8]), int(IDX[9])
K = V_TOP

def ring(z):
    yb, b, t, w = float(YB_(z)), float(B_(z)), float(T_(z)), float(W0_(z) * taper(z))
    g = float(np.clip((t - b - 0.03) / 0.43, 0, 1))
    ys = yb + 0.11
    wb = w * 0.93
    wr = 0.60 * min(1.0, w / 0.9) if g < 0.05 else (0.60 + (1 - g) * 0.0)
    wr = min(wr, wb * 0.8)
    p6y = max(b + 0.35 * (t - b), t - 0.012 - 0.04 * g)
    p55 = ((wb + wr) / 2 + 0.012 * g, (b + p6y) / 2)
    p3y = ys + 0.60 * (b - ys)
    p4y = max(b - 0.085, p3y + 0.55 * (b - p3y))
    ctrl = [(0, yb), (0.54 * w, yb), (0.63 * w, yb), (0.915 * w, ys), (w, p3y),
            (0.99 * w, p4y), (wb, b), p55, (wr, p6y), (0, t)]
    pts, _ = catmull(ctrl, SUB)
    return pts   # (K+1, 2): x, y

def stations():
    s_f = np.linspace(1, 0, 15)[1:]
    zf = TAPER_F[0] + (ZF - TAPER_F[0]) * (1 - s_f ** TAPER_F[1]) ** (1 / TAPER_F[1])
    zr = TAPER_R[0] - (TAPER_R[0] - ZR) * (1 - np.linspace(1, 0, 15)[1:] ** TAPER_R[1]) ** (1 / TAPER_R[1])
    mid = list(np.arange(TAPER_R[0], TAPER_F[0] + 1e-6, 0.05))
    for c in (AXF, AXR):
        mid += list(np.arange(c - ARCH_R - 0.06, c + ARCH_R + 0.0601, 0.03))
    mid += [0.70, -0.11, -1.05, 1.055, -1.055, 0.60, -0.045, -0.185, 0.228, 0.172, -1.20, -1.26, 0.975, -1.97, -1.12]
    zs = np.array(sorted(set(np.round(list(zr) + mid + list(zf), 4))))
    keep = [zs[0]]
    for z in zs[1:]:
        if z - keep[-1] > 0.004: keep.append(z)
    # asegurar extremos
    keep[0] = ZR; keep[-1] = ZF
    return np.array(keep)

def build_grid():
    zs = stations(); nz = len(zs)
    P = np.zeros((nz, K + 1, 3)); pushed = np.zeros((nz, K + 1), bool)
    for i, z in enumerate(zs):
        r = ring(z); P[i, :, 0] = r[:, 0]; P[i, :, 1] = r[:, 1]; P[i, :, 2] = z
    # normales (acumulación) sobre la malla izquierda
    F = grid_faces(nz, K + 1)
    N = face_normals_acc(P.reshape(-1, 3), F).reshape(nz, K + 1, 3)
    N[:, 0, 0] = 0; N[:, K, 0] = 0
    N = N / np.maximum(np.linalg.norm(N, axis=2, keepdims=True), 1e-9)
    U = (np.arange(K + 1) - V_BELT) / (V_ROOF - V_BELT)
    return dict(zs=zs, P=P, N=N, pushed=pushed, U=U, nz=nz)

def sub_mesh(G, i0, i1, j0, j1, side=1, shrink=None, P=None):
    """Sub-malla (índices inclusive) del lado dado (+1 izq, -1 der) con atributos X=[z,U]."""
    P0 = G['P'] if P is None else P
    Ps = P0[i0:i1 + 1, j0:j1 + 1].copy(); Ns = G['N'][i0:i1 + 1, j0:j1 + 1].copy()
    X = np.zeros(Ps.shape[:2] + (2,)); X[..., 0] = G['zs'][i0:i1 + 1, None]; X[..., 1] = G['U'][None, j0:j1 + 1]
    if side < 0: Ps[..., 0] *= -1; Ns[..., 0] *= -1
    nu, nv = Ps.shape[:2]
    F = grid_faces(nu, nv)
    if side < 0: F = F[:, [0, 2, 1]]
    return Mesh(Ps.reshape(-1, 3), F, Ns.reshape(-1, 3), X=X.reshape(-1, 2))

def shrunk_positions(G, i0, i1, j0, j1, gap):
    """Posiciones de la rejilla con el borde de la puerta recogido 'gap' metros (para dejar la junta)."""
    P = G['P'].copy(); zs = G['zs']
    for i, ib in ((i0, i0 + 1), (i1, i1 - 1)):
        d = abs(zs[ib] - zs[i]); P[i, j0:j1 + 1] = P[i, j0:j1 + 1] * (1 - gap / d) + P[ib, j0:j1 + 1] * (gap / d)
    for j, jb in ((j0, j0 + 1), (j1, j1 - 1)):
        d = np.linalg.norm(P[i0:i1 + 1, jb] - P[i0:i1 + 1, j], axis=1)[:, None]
        P[i0:i1 + 1, j] = P[i0:i1 + 1, j] * (1 - gap / d) + P[i0:i1 + 1, jb] * (gap / d)
    return P

def sample(G, z, V, side=1):
    """Posición y normal interpolados sobre la rejilla en (z, V) (V puede ser fraccionario)."""
    zs = G['zs']; i = int(np.clip(np.searchsorted(zs, z) - 1, 0, len(zs) - 2)); tz = (z - zs[i]) / (zs[i + 1] - zs[i])
    j = int(np.clip(np.floor(V), 0, K - 1)); tv = V - j
    def bil(A):
        return (A[i, j] * (1 - tz) * (1 - tv) + A[i + 1, j] * tz * (1 - tv) + A[i, j + 1] * (1 - tz) * tv + A[i + 1, j + 1] * tz * tv)
    p = bil(G['P']); n = bil(G['N']); n = n / np.linalg.norm(n)
    if side < 0: p = p * np.array([-1, 1, 1]); n = n * np.array([-1, 1, 1])
    return p, n
