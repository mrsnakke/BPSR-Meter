<div align="center">
  <img src="portada.png" alt="Portada" width="800"/>
</div>

# BPSR Meter - Medidor de DPS para Blue Protocol

[![English](https://img.shields.io/badge/English-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4NDAgNjMwIj48cGF0aCBmaWxsPSIjYjIyMjM0IiBkPSJNMCAwaDk4MHY2ODNIMHoiLz48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMCA3Nmg5ODB2NTJIMHptMCAxNTJoOTgwdi01Mkgwem0wIDE1Mmg5ODB2LTUySDB6bTAgMTUyaDk4MHYtNTJIMHptMCAxNTJoOTgwdi01MkgweiIvPjxwYXRoIGZpbGw9IiMwMDMyOTYiIGQ9Ik0wIDBoNDIwVjM2OEgwem0zMCAyNGwzMyAxMDIgMTAtMzEtMzItODcgNzIgMzcgOTctMzcgMTIgMzItNzIgODYgMTIgMzEgOTYtMzcgNzIgMzYtMzItODcgMTAtMzIgMzMgMTAyLTEwMy02Mi0xMDMgNjIgMzMgMTAyIDEwLTMxLTMyLTg3IDcyIDM3IDk3LTM3IDEyIDMyLTcyIDg2IDEyIDMxIDk2LTM3IDcyIDM2LTMyLTg3IDEwLTMyIDMzIDEwMi0xMDMtNjItMTAzIDYyem0wIDEyMGwzMyAxMDIgMTAtMzEtMzItODcgNzIgMzcgOTctMzcgMTIgMzItNzIgODYgMTIgMzEgOTYtMzcgNzIgMzYtMzItODcgMTAtMzIgMzMgMTAyLTEwMy02Mi0xMTAgNjIgMzMgMTAyIDEwLTMxLTMyLTg3IDcyIDM3IDk3LTM3IDEyIDMyLTcyIDg2IDEyIDMxIDk2LTM3IDcyIDM2LTMyLTg3IDEwLTMyIDMzIDEwMi0xMDMtNjItMTAzIDYyem0xNjggMTIwbDMzIDEwMiAxMC0zMS0zMi04NyA3MiAzNyA5Ny0zNyAxMiAzMi03MiA4NiAxMiAzMSA5Ni0zNyA3MiAzNi0zMi04NyAxMC0zMiAzMyAxMDItMTAzLTYyLTEwMyA2MnoiLz48L3N2Zz4=)](./README.md#dps-meter-english-version)

Un medidor de DPS (Daño Por Segundo) diseñado para **Blue Protocol: Star Resonance**, ideal para jugadores y streamers que desean analizar y mostrar su rendimiento en tiempo real.

---

## ¿Cómo funciona?

Este medidor opera capturando y analizando el tráfico de red del juego en tiempo real. Utiliza **Npcap** para monitorear los paquetes de datos, decodificándolos para extraer información precisa sobre daño, curación y otras estadísticas de combate, todo sin interactuar directamente con los archivos del juego.

![Medidor DPS en acción](medidor.png)

### Leyenda de la Interfaz

1.  **Nombre de jugador:** Tu identificador en el medidor.
2.  **Vida actual y máxima:** Barra de salud visual.
3.  **DPS (Daño por Segundo):** Daño infligido por segundo.
4.  **HPS (Curación por Segundo):** Curación realizada por segundo.
5.  **DT (Daño Recibido):** Daño total recibido durante el combate.
6.  **Contribución %:** Tu porcentaje del daño total del grupo.
7.  **CRIT ✸:** Porcentaje de golpes críticos.
8.  **LUCK ☘:** Porcentaje de golpes de suerte.
9.  **MAX ⚔ (Máximo DPS):** Tu pico más alto de daño por segundo.
10. **GS (Puntuación de Equipo):** Puntuación de tu equipamiento y habilidades.
11. **🔥 (Daño Total):** Daño total acumulado en el encuentro.
12. **⛨ (Curación Total):** Curación total acumulada en el encuentro.

---

> ### Uso Responsable
> Esta herramienta está diseñada para ayudarte a mejorar tu propio rendimiento. **Por favor, no la utilices para degradar, acosar o discriminar a otros jugadores.** El objetivo es la superación personal y el disfrute del juego en comunidad.

---

## Prerrequisitos

Para que el medidor funcione, necesitas instalar lo siguiente:

1.  **Npcap:**
    *   Instala `npcap-1.83.exe`. Es esencial para que el medidor pueda capturar el tráfico de red del juego.

2.  **Permisos de Administrador:**
    *   El ejecutable `BPSR Meter.exe` debe ejecutarse **como administrador** para tener los permisos necesarios para monitorear la red.

---

## Instrucciones de Uso

### Video Tutorial
Para una guía visual sobre cómo instalar y configurar el medidor, puedes ver el siguiente video:

[![Video Tutorial de YouTube](https://img.youtube.com/vi/dQw4w9WgXcQ/0.jpg)](https://www.youtube.com/watch?v=dQw4w9WgXcQ)
> **Nota:** ¡Guía en video próximamente!.

### Método 1: Uso Local (Navegador o OBS en la misma PC)
Ideal si juegas y transmites desde la misma computadora.

1.  **Inicia el Medidor:** Ejecuta `BPSR Meter.exe` como administrador.
2.  **Abre en el Navegador:** Ve a `http://localhost:8989` en tu navegador.
3.  **Integra en OBS:**
    *   Añade una nueva "Fuente de Navegador" en OBS.
    *   Usa la URL `http://localhost:8989`.
    *   Ajusta el tamaño a tu gusto.

### Método 2: Uso para Streamers de Doble PC
Si usas una PC para jugar y otra para transmitir.

1.  **Obtén la IP de tu PC de Juego:**
    *   Abre CMD y escribe `ipconfig`.
    *   Busca tu "Dirección IPv4" (ej. `192.168.1.100`).
2.  **Accede desde la PC de Streaming:**
    *   En el navegador u OBS de tu PC de streaming, usa la URL: `http://<TU-IP-AQUÍ>:8989/index.html` (reemplaza `<TU-IP-AQUÍ>` con la IP que anotaste).
    *   **Importante:** Asegúrate de que el firewall de tu PC de juego permita la conexión en el puerto `8989`.

---

## Preguntas Frecuentes (FAQ)

**¿Es baneable usar este medidor?**
> Opera en una "zona gris". No modifica archivos, no inyecta código ni altera la memoria del juego. Históricamente, las herramientas que solo leen datos tienen un riesgo de baneo muy bajo. Sin embargo, **úsalo bajo tu propia responsabilidad.**

**¿Afecta el rendimiento de mi juego (FPS)?**
> No. El impacto es prácticamente nulo, ya que la captura de paquetes es un proceso pasivo y muy ligero.

**¿Por qué necesita ejecutarse como administrador?**
> Para que la librería Npcap pueda acceder a bajo nivel a los adaptadores de red y monitorear los paquetes del juego.

**El medidor no muestra datos, ¿qué hago?**
> 1. Asegúrate de que el juego esté corriendo **antes** de iniciar el medidor.
> 2. Confirma que ejecutaste el medidor **como administrador**.
> 3. Revisa que tu firewall o antivirus no lo esté bloqueando.
> 4. Si tienes múltiples conexiones de red (Ethernet, Wi-Fi, VPN), el medidor podría estar escuchando en la incorrecta.

**¿Funciona con otros juegos?**
> No. Está diseñado específicamente para decodificar los paquetes de red de este juego.

**¿Funciona en el servidor chino?**
> Sí, funciona correctamente en el servidor chino.

---

## Redes Sociales

[![Twitch](https://img.shields.io/badge/Twitch-9146FF?style=for-the-badge&logo=twitch&logoColor=white)](https://www.twitch.tv/mrsnakevt)
[![Kick](https://img.shields.io/badge/Kick-50FF78?style=for-the-badge&logo=kick&logoColor=white)](https://kick.com/mrsnakevt)
[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/@MrSnake_VT)
[![X (Twitter)](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/MrSnakeVT)

---
---

# DPS METER (English Version)
<div align="center">
  <img src="portada.png" alt="Portada" width="800"/>
</div>

A DPS (Damage Per Second) meter designed for **Blue Protocol: Star Resonance**, ideal for players and streamers who want to analyze and display their performance in real-time.

## How it Works

This meter operates by capturing and analyzing the game's network traffic in real-time. It uses **Npcap** to monitor data packets, decoding them to extract accurate information about damage, healing, and other combat stats, all without directly interacting with the game files.

![DPS Meter in action](medidor.png)

### Interface Legend

1.  **Player Name:** Your identifier on the meter.
2.  **Current/Max HP:** Visual health bar.
3.  **DPS (Damage Per Second):** Damage dealt per second.
4.  **HPS (Healing Per Second):** Healing done per second.
5.  **DT (Damage Taken):** Total damage received during combat.
6.  **Contribution %:** Your percentage of the group's total damage.
7.  **CRIT ✸:** Percentage of critical hits.
8.  **LUCK ☘:** Percentage of lucky hits.
9.  **MAX ⚔ (Maximum DPS):** Your highest damage per second peak.
10. **GS (Gear Score):** Score of your equipment and abilities.
11. **🔥 (Total Damage):** Total damage accumulated in the encounter.
12. ** _ (Total Healing):** Total healing accumulated in the encounter.

---

> ### Responsible Use
> This tool is designed to help you improve your own performance. **Please do not use it to degrade, harass, or discriminate against other players.** The goal is self-improvement and enjoying the game as a community.

---

## Prerequisites

For the meter to work, you need to install the following:

1.  **Npcap:**
    *   Install `npcap-1.83.exe`. It is essential for the meter to capture game network traffic.

2.  **Administrator Permissions:**
    *   The `BPSR Meter.exe` executable must be run **as administrator** to have the necessary permissions to monitor the network.

---

## Usage Instructions

### Video Tutorial
For a visual guide on how to install and set up the meter, you can watch the following video:

[![YouTube Video Tutorial](https://img.youtube.com/vi/dQw4w9WgXcQ/0.jpg)](https://www.youtube.com/watch?v=dQw4w9WgXcQ)
> **Note:** Video guide coming soon!.

### Method 1: Local Use (Browser or OBS on the same PC)
Ideal if you play and stream from the same computer.

1.  **Start the Meter:** Run `BPSR Meter.exe` as an administrator.
2.  **Open in Browser:** Go to `http://localhost:8989` in your browser.
3.  **Integrate into OBS:**
    *   Add a new "Browser Source" in OBS.
    *   Use the URL `http://localhost:8989`.
    *   Adjust the size to your liking.

### Method 2: Use for Dual PC Streamers
If you use one PC for gaming and another for streaming.

1.  **Get Your Gaming PC's IP:**
    *   Open CMD and type `ipconfig`.
    *   Look for your "IPv4 Address" (e.g., `192.168.1.100`).
2.  **Access from the Streaming PC:**
    *   In the browser or OBS on your streaming PC, use the URL: `http://<YOUR-IP-HERE>:8989/index.html` (replace `<YOUR-IP-HERE>` with the IP you noted).
    *   **Important:** Ensure your gaming PC's firewall allows the connection on port `8989`.

---

## Frequently Asked Questions (FAQ)

**Is using this meter bannable?**
> It operates in a "gray area." It does not modify files, inject code, or alter game memory. Historically, tools that only read data have a very low risk of being banned. However, **use it at your own risk.**

**Does it affect my game's performance (FPS)?**
> No. The impact is virtually nil, as packet capture is a passive and very lightweight process.

**Why does it need to run as an administrator?**
> So that the Npcap library can have low-level access to the network adapters to monitor game packets.

**The meter shows no data, what do I do?**
> 1. Make sure the game is running **before** starting the meter.
> 2. Confirm you have run the meter **as an administrator**.
> 3. Check that your firewall or antivirus is not blocking it.
> 4. If you have multiple network connections (Ethernet, Wi-Fi, VPN), the meter might be listening on the wrong one.

**Does it work with other games?**
> No. It is specifically designed to decode the network packets of this game.

**Does it work on the Chinese server?**
> Yes, it works correctly on the Chinese server.

---

## Social Media

[![Twitch](https://img.shields.io/badge/Twitch-9146FF?style=for-the-badge&logo=twitch&logoColor=white)](https://www.twitch.tv/mrsnakevt)
[![Kick](https://img.shields.io/badge/Kick-50FF78?style=for-the-badge&logo=kick&logoColor=white)](https://kick.com/mrsnakevt)
[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/@MrSnake_VT)
[![X (Twitter)](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/MrSnakeVT)
