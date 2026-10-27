# upgrade_lights — mejora de luces e intermitentes sobre un GLB existente

`python3 -I upgrade_lights.py entrada.glb salida.glb` (solo numpy). Probado con **«Tesla 2018 Model 3»** de Ameer Studio
(<https://sketchfab.com/3d-models/tesla-2018-model-3-5ef9b845aaf44203b6d04e2c677e444f>), licencia **CC-BY 4.0**: si lo redistribuyes
debes mantener la atribución al autor y señalar que está modificado.

Qué hace (sin tocar la geometría original):
- Quita los emisivos fijos del original (hacían brillar siempre algunas luces y la luz interior) → todo **apagado por defecto**.
- Crea un nodo gemelo «ON» por luz, con material emisivo, y las lentes translúcidas se aclaran al encender.
- Añade repetidores laterales en el guardabarros (el original no los tenía; posición estimada) y conos de luz para cortas/largas.
- Clips: `Luces_DRL`, `Luces_Cortas`, `Luces_Largas`, `Luces_Antiniebla`, `Luces_Posicion_Traseras`, `Luces_Freno`, `Luces_MarchaAtras`,
  `Luz_Interior`, `Intermitente_Izquierdo`, `Intermitente_Derecho`, `Warning_Emergencia` (parpadeo de 1 s en bucle).

Límites: cortas y largas comparten la misma malla de reflector (solo cambia intensidad + cono); las cortas/largas no se pueden separar por
módulo LED sin remodelar el faro. Los intermitentes parpadean a la vez, no en secuencia.
