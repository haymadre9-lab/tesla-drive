# Notas de Voz

APK Android (Kotlin) para dictar notas conduciendo, sin tocar el móvil. Todo gratis y offline: reconocimiento de voz con [Vosk](https://alphacephei.com/vosk/) (modelo pequeño en español).

## Uso
1. Abre la app una vez, pulsa **Activar escucha** y concede micrófono, ubicación y notificaciones.
2. Pulsa **Ajustes de batería** y permite inicio automático / actividad en segundo plano (Realme/ColorOS); bloquea la app en recientes.
3. Di **"oye nota"** → pitido → dicta, por ejemplo:
   - "trabajo llamar a Pedro el jueves"
   - "añadir nota de compra leche y pan"
   - "lugar la ferretería buena está aquí" (guarda tu ubicación)
4. Tras 2 s de silencio la guarda y responde por voz: "Anotado en trabajo".

Categorías: trabajo, casa, compra, lugar (y *general* si no dices ninguna). Cada nota guarda la ubicación; las de *lugar* avisan por voz al pasar a menos de 250 m. La lista se filtra por categoría y se ordena por fecha o por cercanía; tocar una nota con ubicación la abre en el mapa, mantener pulsado la borra.

## Compilar
Actions → *Compilar Notas de Voz* → descarga el artefacto `NotasDeVoz-apk` (APK de depuración, instalable directamente).
