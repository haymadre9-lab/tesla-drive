# Tesla Model 3 Highland 2025 (Long Range AWD) — modelo 3D `.glb`

Modelo **generado por código** (Python + numpy, sin Blender): carrocería paramétrica, interior completo, llantas
Photon 18" (235/45 R18), puertas que abren, luces con estados encendido/apagado e intermitentes animados.

| Archivo | Qué es |
|---|---|
| `tesla_model3_highland_2025.glb` | Modelo principal. Todas las luces **apagadas**; las luces se activan con las animaciones (abajo). |
| `tesla_model3_highland_2025_luces_encendidas.glb` | Mismo modelo con diurnas + cortas + posición ya encendidas (para visores que no reproducen animaciones). |
| `viewer.html` | Visor con botones: puertas, luces, intermitentes, warning, ruedas girando, día/noche, cámaras (incluida vista de conductor). |
| `model3.py` (+ `body.py`, `parts.py`, `lights.py`, `interior.py`, `glb_lib.py`) | Generador. `python3 model3.py salida.glb` (requiere `numpy` y `Pillow`). |
| `previews/` | Capturas de referencia. |

## Cómo verlo
```bash
cd model3 && python3 -m http.server 8000     # y abrir http://localhost:8000/viewer.html
```
(`viewer.html` carga three.js desde jsDelivr, hace falta internet y servirlo por HTTP, no `file://`.)
También abre en Blender (Archivo → Importar → glTF), Windows 3D Viewer / Visor 3D, y cualquier visor glTF 2.0.
Usa extensiones estándar: `KHR_materials_clearcoat`, `KHR_materials_emissive_strength`, `KHR_materials_sheen`, `KHR_materials_unlit`.
Validado con el validador oficial de Khronos: 0 errores, 0 avisos.

## Qué incluye
- **Exterior**: carrocería Pearl White con clearcoat, vidrios tintados translúcidos (parabrisas, techo panorámico, lunas, cristal de custodia),
  juntas de puertas, manillas enrasadas, retrovisores, pasos de rueda, bajos negros, emblemas "T".
- **Puertas** (4): bisagra delantera, apertura ~64°, con tarjeta interior, reposabrazos, tirador, altavoz, luz ambiente. Retrovisores en las puertas delanteras.
- **Interior visible a través de los cristales**: salpicadero, **pantalla central 15,4"** (con interfaz dibujada), volante de dos radios, retrovisor interior,
  asientos delanteros, banqueta trasera con 3 reposacabezas, consola central con posavasos y **pantalla trasera**, pedales, moqueta, maletero.
- **Ruedas Photon 18"**: neumático con dibujo, llanta de 5 aspas con huecos reales, disco de freno y pinza visibles, tuercas, tapa central.

## Animaciones (clips glTF)
| Clip | Acción |
|---|---|
| `Puerta_FL_abrir`, `Puerta_FR_abrir`, `Puerta_RL_abrir`, `Puerta_RR_abrir` | Abrir cada puerta (1,2 s, con suavizado). Reproducir al revés para cerrar. |
| `Luces_DRL` | Luces diurnas (tira LED delantera). |
| `Luces_Cortas` / `Luces_Largas` | Cortas / **carretera** (módulos LED + cono de luz). |
| `Luces_Posicion_Traseras` | Barra trasera y pilotos (posición). |
| `Luces_Freno` | Luces de freno (barra + pilotos + tercera luz). |
| `Luces_MarchaAtras` | Marcha atrás. |
| `Intermitente_Izquierdo` / `Intermitente_Derecho` / `Warning_Emergencia` | Intermitentes **delanteros, traseros y en las cámaras laterales del guardabarros** (bucle de 1 s). |
| `Ruedas_Girar` | Giro de las 4 ruedas (bucle). |

Las luces son nodos con nombre (`DRL_L/R`, `LowBeam_L/R`, `HighBeam_L/R`, `TurnFront_L/R`, `TurnSide_L/R`, `TurnRear_L/R`, `Tail_L/R`,
`Brake_L/R`, `Reverse_L/R`) cuyo *scale* pasa de ~0 (apagado) a 1 (encendido). En Unity/Unreal/Three.js puedes activarlos directamente
sin usar los clips. Para el efecto de resplandor real hace falta *bloom* en el motor de render (el emisivo usa `emissive_strength`).

## Límites honestos
- Es un modelo **procedural**: es reconocible como Model 3 Highland (proporciones, luces finas, techo de cristal, barra trasera, llantas, interior minimalista),
  pero **no es un escaneo ni un modelo de estudio**: las superficies son más simples que las de un coche real y no hay texturas fotográficas ni lettering.
- Las llantas Photon son una aproximación de diseño (aspas aerodinámicas), no una réplica exacta.
- No hay capó/maletero abribles, dirección de ruedas delanteras, matrícula, limpiaparabrisas ni cinturones.
- Cotas de referencia usadas: 4,72 × 1,85 × 1,44 m, batalla 2,88 m (aprox.).
