"""Piezas: ruedas Photon 18", frenos, espejos, etc."""
import numpy as np
from glb_lib import *
from body import TIRE_R

RIM_R = 0.2286      # 18"
HW = 0.1175         # semiancho neumático 235

def tire_mesh():
    r0 = RIM_R
    prof = [(-0.088, r0 - 0.004), (-0.096, r0 + 0.006), (-0.108, r0 + 0.030), (-0.1165, 0.262), (-0.1175, 0.290), (-0.1125, 0.316),
            (-0.098, 0.3315), (-0.090, TIRE_R - 0.001),
            (-0.075, TIRE_R), (-0.062, TIRE_R - 0.004), (-0.056, TIRE_R - 0.004), (-0.050, TIRE_R),
            (-0.012, TIRE_R), (-0.006, TIRE_R - 0.004), (0.006, TIRE_R - 0.004), (0.012, TIRE_R),
            (0.050, TIRE_R), (0.056, TIRE_R - 0.004), (0.062, TIRE_R - 0.004), (0.075, TIRE_R),
            (0.090, TIRE_R - 0.001), (0.098, 0.3315), (0.1125, 0.316), (0.1175, 0.290), (0.1165, 0.262),
            (0.108, r0 + 0.030), (0.096, r0 + 0.006), (0.088, r0 - 0.004), (0.088, r0 - 0.004), (-0.088, r0 - 0.004)]
    return lathe(prof, 72)

def rim_barrel():
    r0 = RIM_R
    prof = [(-0.112, r0 - 0.030), (-0.112, r0 + 0.001), (-0.104, r0 + 0.006), (-0.094, r0 + 0.002), (-0.088, r0 - 0.006),
            (-0.088, r0 - 0.006), (0.060, r0 - 0.006), (0.0905, r0 - 0.004), (0.095, r0 + 0.002), (0.107, r0 + 0.006),
            (0.113, r0 + 0.001), (0.113, r0 - 0.012)]
    return lathe(prof, 72)

def wheel_face(nth=240, nr=32):
    """Cara del llanta tipo Photon: disco aerodinámico con 5 aspas curvadas y huecos que dejan ver el freno."""
    rs = np.concatenate([np.linspace(0.0, 0.2286, nr)])
    th = np.linspace(0, 2 * np.pi, nth, endpoint=False)
    TH, RR = np.meshgrid(th, rs, indexing='ij')
    def dish(r):    # posición axial de la cara (X): hub hundido, borde saliente
        return 0.050 + 0.040 * (r / RIM_R) ** 2.2
    A = dish(RR)
    P = np.stack([A, RR * np.cos(TH), RR * np.sin(TH)], -1)
    swirl = 0.75
    phi = TH + swirl * (RR - 0.07) / 0.16
    m = np.cos(5 * phi) + 0.30
    m += np.clip((RR - 0.200) * 60, 0, 4) + np.clip((0.092 - RR) * 60, 0, 4)
    X = np.stack([m, RR], -1)
    mesh = grid(P, wrap=True)       # normal ~ e_v × e_u
    # orientar normales hacia +X (exterior)
    if mesh.N[len(mesh.N) // 2][0] < 0: mesh = flip(mesh)
    mesh.X = X.reshape(-1, 2)
    return mesh

def build_wheel_parts(M):
    """Devuelve lista [(Mat, Mesh)] de una rueda con el exterior hacia +X, centrada en el origen."""
    parts = []
    parts.append((M['tire'], tire_mesh()))
    parts.append((M['rim_dark'], rim_barrel()))
    face = wheel_face()
    spokes, holes = split_mesh(face, face.X[:, 0])
    spokes.X = None
    back, walls = extrude_surface(spokes, np.array([-0.020, 0, 0]) * np.ones((len(spokes.P), 1)))
    parts.append((M['rim_metal'], spokes)); parts.append((M['rim_dark'], back))
    if walls is not None: parts.append((M['rim_metal'], walls))
    # freno: disco ventilado + campana + pinza
    disc = lathe([(0.008, 0.0), (0.008, 0.062), (0.020, 0.062), (0.020, 0.070), (0.030, 0.070), (0.030, 0.092), (0.030, 0.092),
                  (0.030, 0.165), (0.060, 0.165), (0.060, 0.165), (0.060, 0.092)][:0] or
                 [(0.012, 0.050), (0.026, 0.050), (0.026, 0.080), (0.026, 0.080), (0.026, 0.168), (0.026, 0.168), (0.0, 0.168), (0.0, 0.168),
                  (0.0, 0.085), (0.012, 0.085)], 64)
    parts.append((M['brake_disc'], disc))
    cal = rbox((0.062, 0.062, 0.150), 0.012, 3)
    cal = xform(cal, trans(0.016, 0, 0) @ rot_x(np.radians(62)) @ trans(0, 0.128, 0))
    parts.append((M['caliper'], cal))
    # tuercas y tapa central
    nuts = []
    for k in range(5):
        a = 2 * np.pi * k / 5 + 0.3
        nuts.append(xform(cylinder(0.0105, 0.016, 'x', 12), trans(0.062, 0.0575 * np.cos(a), 0.0575 * np.sin(a))))
    parts.append((M['rim_dark'], concat(nuts)))
    cap = lathe([(0.052, 0.0), (0.052, 0.030), (0.052, 0.030), (0.058, 0.030), (0.062, 0.020), (0.063, 0.0)], 40)
    parts.append((M['cap'], cap))
    return parts
