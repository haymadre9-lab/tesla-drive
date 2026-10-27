"""Interior del Model 3 Highland: salpicadero, pantalla 15,4", volante, asientos, consola, maletero..."""
import io, math
import numpy as np
from glb_lib import *

def rot_from_to(a, b):
    a = np.asarray(a, float); a = a / np.linalg.norm(a); b = np.asarray(b, float); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = float(a @ b)
    if np.linalg.norm(v) < 1e-9:
        return np.eye(4) if c > 0 else rot_y(math.pi)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    R = np.eye(3) + vx + vx @ vx * (1 / (1 + c))
    M = np.eye(4); M[:3, :3] = R; return M

def prism(profile, x0, x1, smooth=True):
    """Perfil cerrado (z,y) barrido en X -> malla suave (sin tapas)."""
    prof = np.asarray(profile, float)
    xs = np.linspace(x0, x1, 2)
    P = np.zeros((len(prof), 2, 3))
    for k, x in enumerate(xs): P[:, k, 0] = x
    P[:, :, 2] = prof[:, 0, None]; P[:, :, 1] = prof[:, 1, None]
    m = grid(P, wrap=True)
    # normal exterior: comprobar con el centroide
    c = m.P.mean(0); 
    if ((m.P - c) * m.N).sum() < 0: m = flip(m)
    return m

def tapered_box(size, r=0.01, seg=3):
    return rbox(size, r, seg)

def place(m, pos, rot=None):
    M = trans(*pos)
    if rot is not None: M = M @ rot
    return xform(m, M)

def ui_textures():
    from PIL import Image, ImageDraw, ImageFont
    def font(n):
        try: return ImageFont.load_default(size=n)
        except TypeError: return ImageFont.load_default()
    W, H = 1024, 640
    im = Image.new('RGB', (W, H), (10, 12, 15)); d = ImageDraw.Draw(im)
    # mapa
    d.rectangle([330, 60, W, H - 70], fill=(24, 28, 33))
    rng = np.random.RandomState(4)
    for k in range(14):
        x = 330 + k * 52; d.line([(x, 60), (x + rng.randint(-60, 60), H - 70)], fill=(44, 50, 58), width=3)
    for k in range(9):
        y = 90 + k * 55; d.line([(330, y), (W, y + rng.randint(-40, 40))], fill=(44, 50, 58), width=3)
    d.line([(420, H - 90), (560, 430), (640, 380), (760, 300), (900, 200), (980, 120)], fill=(61, 142, 255), width=12, joint='curve')
    cx, cy = 560, 430
    d.ellipse([cx - 34, cy - 34, cx + 34, cy + 34], fill=(30, 90, 190)); d.polygon([(cx, cy - 24), (cx + 16, cy + 16), (cx, cy + 8), (cx - 16, cy + 16)], fill=(255, 255, 255))
    # barra superior
    d.rectangle([0, 0, W, 60], fill=(8, 9, 11)); d.text((24, 12), '21:47', font=font(34), fill=(235, 235, 235)); d.text((140, 16), '21 °C', font=font(28), fill=(170, 175, 180))
    d.rounded_rectangle([880, 18, 990, 44], 6, outline=(210, 210, 210), width=3); d.rectangle([884, 22, 960, 40], fill=(90, 200, 120))
    # panel izquierdo
    d.text((26, 80), 'P', font=font(70), fill=(255, 255, 255)); d.text((26, 190), '0', font=font(120), fill=(255, 255, 255)); d.text((150, 270), 'km/h', font=font(30), fill=(160, 165, 170))
    # coche en planta
    d.rounded_rectangle([120, 340, 230, 560], 26, fill=(205, 208, 212)); d.rounded_rectangle([135, 400, 215, 470], 12, fill=(40, 46, 52))
    for (x, y) in ((108, 372), (108, 500), (222, 372), (222, 500)): d.rounded_rectangle([x, y, x + 12, y + 44], 4, fill=(60, 64, 68))
    d.text((26, 580), '438 km', font=font(30), fill=(150, 220, 160))
    # barra inferior
    d.rectangle([0, H - 70, W, H], fill=(8, 9, 11))
    for k in range(9):
        x = 60 + k * 108; d.ellipse([x, H - 56, x + 40, H - 16], outline=(120, 126, 132), width=3)
    main = im
    im2 = Image.new('RGB', (512, 320), (10, 12, 15)); d2 = ImageDraw.Draw(im2)
    d2.text((20, 14), 'Climate', font=font(30), fill=(220, 220, 220))
    for k in range(3):
        d2.rounded_rectangle([20 + k * 160, 80, 150 + k * 160, 180], 12, fill=(28, 33, 39)); d2.text((46 + k * 160, 108), ['21°', 'AUTO', '21°'][k], font=font(30), fill=(235, 235, 235))
    d2.rounded_rectangle([20, 210, 492, 290], 12, fill=(28, 33, 39)); d2.rectangle([32, 246, 330, 254], fill=(61, 142, 255))
    out = []
    for img in (main, im2):
        b = io.BytesIO(); img.save(b, 'PNG'); out.append(b.getvalue())
    return out

def build_interior(M):
    P = []          # (matname, mesh)
    add = lambda mat, m: P.append((mat, m))
    # ---------- suelo, maletero
    add('carpet', rbox((1.62, 0.04, 2.18), 0.012, 2, (0, 0.25, -0.40)))
    add('carpet', rbox((1.22, 0.04, 0.86), 0.012, 2, (0, 0.50, -1.67)))
    for sx in (-1, 1):
        add('liner', rbox((0.03, 0.44, 0.86), 0.01, 2, (sx * 0.60, 0.72, -1.67)))
    add('liner', rbox((1.22, 0.44, 0.03), 0.01, 2, (0, 0.72, -2.10)))
    add('carpet', rbox((1.22, 0.02, 0.03), 0.008, 2, (0, 0.52, -1.24)))
    # ---------- salpicadero
    dash = prism([(0.99, 0.30), (0.99, 0.940), (0.80, 0.930), (0.62, 0.912), (0.53, 0.885), (0.50, 0.835), (0.54, 0.70), (0.66, 0.50), (0.84, 0.30)], -0.86, 0.86)
    add('dash', dash)
    add('ambient', rbox((1.62, 0.006, 0.006), 0.002, 1, (0, 0.865, 0.495)))
    add('plastic_dark', rbox((0.42, 0.012, 0.03), 0.004, 1, (0, 0.925, 0.56)))        # rejilla de ventilación oculta
    # ---------- pantalla central 15,4"
    tilt = rot_x(math.radians(-11))
    sc = (0.0, 1.03, 0.60)
    add('screen_bezel', place(rbox((0.352, 0.222, 0.014), 0.006, 2), sc, tilt))
    face = grid(np.array([[[-0.164, 0.102, 0], [-0.164, -0.102, 0]], [[0.164, 0.102, 0], [0.164, -0.102, 0]]]) , flip_=False)
    # UV
    uv = np.array([[1, 0], [1, 1], [0, 0], [0, 1]], float)   # (u,v) por vértice (orden de grid: i mayor)
    fm = Mesh(face.P, face.F, face.N, UV=uv)
    # orientar hacia -Z
    if np.cross(fm.P[fm.F[0, 1]] - fm.P[fm.F[0, 0]], fm.P[fm.F[0, 2]] - fm.P[fm.F[0, 0]])[2] > 0: fm = flip(fm)
    fm.N = np.tile([0, 0, -1.0], (4, 1))
    fm.P = fm.P + np.array([0, 0, -0.0075])
    add('screen_main', place(fm, sc, tilt))
    add('plastic_dark', place(rbox((0.05, 0.10, 0.03), 0.008, 2), (0, 0.97, 0.66), tilt))
    # ---------- retrovisor interior
    add('plastic_dark', rbox((0.012, 0.07, 0.02), 0.005, 1, (0, 1.27, 0.43)))
    add('plastic_dark', place(rbox((0.26, 0.055, 0.035), 0.017, 3), (0, 1.215, 0.40), rot_x(math.radians(-6))))
    add('mirror_glass', place(rbox((0.235, 0.040, 0.004), 0.002, 1), (0, 1.215, 0.381), rot_x(math.radians(-6))))
    # ---------- volante
    C = np.array([0.37, 0.865, 0.375]); n = np.array([0, 0.30, -0.954]); n = n / np.linalg.norm(n)
    R = rot_from_to([1, 0, 0], n)
    rim = lathe(circle_profile(0, 0.172, 0.0155, 14), 72)
    add('steer_leather', xform(rim, trans(*C) @ R))
    hub = rbox((0.052, 0.095, 0.115), 0.022, 3)
    add('steer_hub', xform(hub, trans(*C) @ R @ trans(-0.012, 0, 0)))
    for sy in (-1, 1):
        add('steer_leather', xform(rbox((0.020, 0.036, 0.100), 0.010, 2), trans(*C) @ R @ trans(-0.006, 0, sy * 0.115) @ rot_x(sy * 0.12)))
        add('screen_bezel', xform(cylinder(0.0105, 0.004, 'x', 16), trans(*C) @ R @ trans(0.007, 0.012, sy * 0.115)))
        add('screen_bezel', xform(cylinder(0.0105, 0.004, 'x', 16), trans(*C) @ R @ trans(0.007, -0.016, sy * 0.115)))
    add('chrome', xform(cylinder(0.014, 0.004, 'x', 20), trans(*C) @ R @ trans(0.017, 0, 0)))
    col = xform(cylinder(0.038, 0.20, 'x', 20), trans(*(C - n * 0.095)) @ R)
    add('plastic_dark', col)
    # pedales
    add('plastic_dark', xform(rbox((0.075, 0.012, 0.120), 0.004, 1), trans(0.30, 0.34, 0.82) @ rot_x(math.radians(-38))))
    add('plastic_dark', xform(rbox((0.095, 0.012, 0.085), 0.004, 1), trans(0.40, 0.33, 0.80) @ rot_x(math.radians(-38))))
    add('chrome', xform(rbox((0.060, 0.004, 0.016), 0.001, 1), trans(0.30, 0.345, 0.80) @ rot_x(math.radians(-38))))
    # ---------- asientos delanteros
    def front_seat(x):
        parts = []
        cushion = rbox((0.50, 0.13, 0.54), 0.055, 4, (x, 0.455, -0.08))
        parts.append(('seat', cushion))
        for sx in (-1, 1): parts.append(('seat', rbox((0.07, 0.10, 0.46), 0.035, 3, (x + sx * 0.215, 0.505, -0.10))))
        parts.append(('plastic_dark', rbox((0.40, 0.10, 0.40), 0.02, 2, (x, 0.35, -0.08))))
        a = math.radians(-18)
        T0 = trans(x, 0.0, -0.37) @ trans(0, 0.52, 0) @ rot_x(a)
        parts.append(('seat', xform(rbox((0.50, 0.66, 0.13), 0.05, 4), T0 @ trans(0, 0.33, 0))))
        for sx in (-1, 1): parts.append(('seat', xform(rbox((0.08, 0.60, 0.11), 0.035, 3), T0 @ trans(sx * 0.215, 0.33, 0.035))))
        parts.append(('seat', xform(rbox((0.30, 0.20, 0.10), 0.045, 3), T0 @ trans(0, 0.78, -0.005))))
        parts.append(('plastic_dark', xform(rbox((0.46, 0.60, 0.012), 0.005, 1), T0 @ trans(0, 0.33, -0.07))))
        return parts
    for x in (0.37, -0.37):
        for mt, m in front_seat(x): add(mt, m)
    # ---------- consola central
    add('console', rbox((0.25, 0.30, 0.95), 0.025, 3, (0, 0.46, -0.08)))
    add('console_gloss', rbox((0.23, 0.012, 0.93), 0.004, 2, (0, 0.612, -0.08)))
    for zc in (-0.02, -0.20):
        add('plastic_dark', xform(cylinder(0.034, 0.014, 'y', 24), trans(0, 0.614, zc)))
    add('rubber', rbox((0.20, 0.004, 0.11), 0.002, 1, (0, 0.62, 0.30)))
    add('plastic_dark', rbox((0.22, 0.020, 0.34), 0.008, 2, (0, 0.595, 0.30)))
    add('plastic_dark', rbox((0.20, 0.10, 0.30), 0.02, 2, (0, 0.55, -0.50)))
    rs = rot_x(math.radians(-8)); rc = (0, 0.585, -0.58)
    add('screen_bezel', place(rbox((0.205, 0.128, 0.012), 0.005, 2), rc, rs))
    f2 = Mesh(np.array([[-0.093, 0.056, -0.0066], [-0.093, -0.056, -0.0066], [0.093, 0.056, -0.0066], [0.093, -0.056, -0.0066]]),
              np.array([[0, 2, 1], [1, 2, 3]]), np.tile([0, 0, -1.0], (4, 1)), UV=np.array([[1, 0], [1, 1], [0, 0], [0, 1]], float))
    fn = np.cross(f2.P[f2.F[0, 1]] - f2.P[f2.F[0, 0]], f2.P[f2.F[0, 2]] - f2.P[f2.F[0, 0]])
    if fn[2] > 0: f2.F = f2.F[:, [0, 2, 1]]
    add('screen_rear', place(f2, rc, rs))
    # ---------- banqueta trasera
    add('seat', rbox((1.28, 0.14, 0.56), 0.06, 4, (0, 0.44, -0.93)))
    add('plastic_dark', rbox((1.20, 0.10, 0.44), 0.02, 2, (0, 0.33, -0.93)))
    Tr = trans(0, 0, -1.20) @ trans(0, 0.50, 0) @ rot_x(math.radians(-20))
    add('seat', xform(rbox((1.28, 0.62, 0.13), 0.05, 4), Tr @ trans(0, 0.31, 0)))
    for xh in (-0.40, 0.0, 0.40):
        add('seat', xform(rbox((0.21, 0.17, 0.09), 0.04, 3), Tr @ trans(xh, 0.71, -0.005)))
        add('plastic_dark', xform(rbox((0.012, 0.07, 0.012), 0.004, 1), Tr @ trans(xh - 0.05, 0.62, 0)))
        add('plastic_dark', xform(rbox((0.012, 0.07, 0.012), 0.004, 1), Tr @ trans(xh + 0.05, 0.62, 0)))
    add('seat', rbox((0.24, 0.20, 0.07), 0.03, 2, (0, 0.55, -0.905)))
    return P
