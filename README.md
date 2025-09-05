![Portada](portada.png)

# DPS METER by MrSnake

[English Version](#dps-meter-by-mrsnake-english-version)

Este proyecto es un medidor de DPS (Daño Por Segundo) diseñado para ser utilizado en juegos, especialmente útil para streamers que desean mostrar esta información en sus transmisiones.

## ¿Cómo funciona?

Este medidor de DPS funciona capturando y analizando el tráfico de red del juego en tiempo real. Utiliza Npcap para monitorear los paquetes de datos que el juego envía y recibe, decodificándolos para extraer información sobre el daño infligido, la curación realizada y otras estadísticas de combate. Esto permite obtener una visión precisa del rendimiento sin interactuar directamente con los archivos del juego.

## Uso Responsable

Esta herramienta está diseñada para ayudarte a analizar y mejorar tu propio rendimiento en el juego. Úsala para probar nuevas rotaciones de habilidades, optimizar tu equipamiento y entender mejor tu contribución en el combate.

**Por favor, no utilices esta herramienta para degradar, acosar o discriminar a otros jugadores por su rendimiento.** El objetivo es la superación personal y el disfrute del juego en comunidad.

## Prerrequisitos

Para que el DPS Meter funcione correctamente, necesitarás lo siguiente:

1.  **Instalar Npcap:**
    *   En la carpeta `Prerequisites/` encontrarás el instalador `npcap-1.83.exe`. Ejecútalo e instálalo siguiendo las instrucciones. Npcap es necesario para que el medidor pueda capturar el tráfico de red del juego.

2.  **Ejecutar el DPS Meter:**
    *   El ejecutable principal del medidor (asumo que se llama `BPSR Meter.exe` debe ejecutarse **como administrador**. Esto es crucial para que tenga los permisos necesarios para monitorear el tráfico de red.

## Instrucciones de Uso

El DPS Meter puede ser utilizado de dos maneras principales:

### Método 1: Uso Local (Navegador o OBS en la misma PC)

Este método es ideal si estás jugando y transmitiendo desde la misma computadora.

1.  **Iniciar el DPS Meter:** Asegúrate de que `BPSR Meter.exe` esté ejecutándose como administrador.
2.  **Abrir en el Navegador:** Una vez que el DPS Meter esté activo, abre tu navegador web y ve a `http://localhost:8989` (o el puerto que se muestre en la consola al iniciar `server.js`, ya que puede cambiar si el puerto 8989 está en uso). Verás la interfaz del medidor de DPS.
3.  **Usar en OBS (Fuente de Navegador):**
    *   En OBS Studio, añade una nueva "Fuente de Navegador".
    *   En el campo "URL", introduce `http://localhost:8989` (o el puerto que se muestre en la consola).
    *   Ajusta el ancho y alto según tus preferencias.
    *   El medidor de DPS aparecerá en tu escena de OBS.

### Método 2: Uso para Streamers de Doble PC (Acceso Remoto)

Si utilizas una configuración de doble PC (una para jugar y otra para transmitir), necesitarás acceder al medidor desde la PC de streaming.

1.  **Identificar la IP de la PC de Juego:**
    *   En la PC donde está corriendo el DPS Meter (la PC de juego), abre el Símbolo del Sistema (CMD) o PowerShell.
    *   Escribe el comando `ipconfig` y presiona Enter.
    *   Busca la sección de tu adaptador de red (por ejemplo, "Adaptador de Ethernet" o "LAN inalámbrica").
    *   La dirección que necesitas es la "Dirección IPv4". Por ejemplo, podría ser `192.168.1.100`. Anota esta dirección.

2.  **Acceder desde la PC de Streaming:**
    *   En la PC de streaming, abre tu navegador web o OBS Studio.
    *   En la URL, utiliza la dirección IP que anotaste, seguida del puerto del servidor y el archivo `index.html`. Por ejemplo: `http://192.168.1.100:8989/index.html`.
    *   **Importante:** Asegúrate de que el firewall de la PC de juego no esté bloqueando el puerto (por defecto, 8989). Es posible que necesites añadir una excepción para el puerto 8989 en el firewall de Windows.

## Preguntas Frecuentes (FAQ)

### ¿Es baneable usar este medidor de DPS?
Este tipo de herramientas operan en una "zona gris". A diferencia de los hacks o cheats, este medidor **no modifica los archivos del juego, no inyecta código ni altera la memoria del juego**. Simplemente lee el tráfico de red que tu computadora ya está enviando y recibiendo. Históricamente, las herramientas que solo leen datos sin modificar el juego tienen un riesgo de baneo muy bajo. Sin embargo, siempre existe un riesgo inherente al usar cualquier software de terceros. **Úsalo bajo tu propia responsabilidad.**

### ¿Afecta el rendimiento de mi juego (FPS)?
No. El impacto en el rendimiento es prácticamente nulo. La captura de paquetes es un proceso pasivo y muy ligero que no debería afectar tus FPS ni la latencia del juego.

### ¿Por qué necesita ejecutarse como administrador?
El medidor necesita permisos de administrador porque la librería Npcap, que se usa para capturar el tráfico de red, requiere acceso a bajo nivel a los adaptadores de red de tu sistema. Sin estos permisos, no puede monitorear los paquetes del juego.

### El medidor no muestra ningún dato, ¿qué hago?
Asegúrate de lo siguiente:
1.  El juego está corriendo **antes** de iniciar el medidor.
2.  Has ejecutado el medidor **como administrador**.
3.  Tu firewall o antivirus no está bloqueando la conexión. Intenta añadir una excepción para el medidor.
4.  Si tienes múltiples conexiones de red (Ethernet, Wi-Fi, VPN), el medidor podría estar escuchando en la incorrecta. El programa intenta detectar la correcta automáticamente, pero esto no siempre es perfecto.

### ¿Funciona con otros juegos?
No. Este medidor está diseñado específicamente para decodificar los paquetes de red de un juego en particular. La estructura de datos de cada juego es única, por lo que no funcionará con otros títulos.

## Redes Sociales

[![Twitch](https://img.shields.io/badge/Twitch-9146FF?style=for-the-badge&logo=twitch&logoColor=white)](https://www.twitch.tv/mrsnakevt)
[![Kick](https://img.shields.io/badge/Kick-50FF78?style=for-the-badge&logo=kick&logoColor=white)](https://kick.com/mrsnakevt)
[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/@MrSnake_VT)
[![X (Twitter)](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/MrSnakeVT)

---

# DPS METER by MrSnake (English Version)

This project is a DPS (Damage Per Second) meter designed for use in games, especially useful for streamers who want to display this information in their broadcasts.

## How it Works

This DPS meter works by capturing and analyzing game network traffic in real-time. It uses Npcap to monitor data packets that the game sends and receives, decoding them to extract information about damage dealt, healing performed, and other combat statistics. This provides an accurate view of performance without directly interacting with game files.

## Responsible Use

This tool is designed to help you analyze and improve your own in-game performance. Use it to test new skill rotations, optimize your gear, and better understand your contribution in combat.

**Please do not use this tool to degrade, harass, or discriminate against other players based on their performance.** The goal is self-improvement and enjoying the game as a community.

## Prerequisites

For the DPS Meter to function correctly, you will need the following:

1.  **Install Npcap:**
    *   In the `Prerequisites/` folder, you will find the `npcap-1.83.exe` installer. Run it and install it by following the instructions. Npcap is necessary for the meter to capture game network traffic.

2.  **Run the DPS Meter:**
    *   The main executable of the meter (assuming it's named `BPSR Meter.exe`) must be run **as administrator**. This is crucial for it to have the necessary permissions to monitor network traffic.

## Usage Instructions

The DPS Meter can be used in two main ways:

### Method 1: Local Use (Browser or OBS on the same PC)

This method is ideal if you are playing and streaming from the same computer.

1.  **Start the DPS Meter:** Make sure `BPSR Meter.exe` is running as administrator.
2.  **Open in Browser:** Once the DPS Meter is active, open your web browser and go to `http://localhost:8989` (or the port shown in the console when starting `server.js`, as it may change if port 8989 is in use). You will see the DPS meter interface.
3.  **Use in OBS (Browser Source):**
    *   In OBS Studio, add a new "Browser Source".
    *   In the "URL" field, enter `http://localhost:8989` (or the port shown in the console).
    *   Adjust the width and height as per your preferences.
    *   The DPS meter will appear in your OBS scene.

### Method 2: Use for Dual PC Streamers (Remote Access)

If you use a dual PC setup (one for gaming and one for streaming), you will need to access the meter from the streaming PC.

1.  **Identify the Gaming PC's IP:**
    *   On the PC where the DPS Meter is running (the gaming PC), open Command Prompt (CMD) or PowerShell.
    *   Type the command `ipconfig` and press Enter.
    *   Look for your network adapter section (e.g., "Ethernet Adapter" or "Wireless LAN").
    *   The address you need is the "IPv4 Address". For example, it might be `192.168.1.100`. Write down this address.

2.  **Access from the Streaming PC:**
    *   On the streaming PC, open your web browser or OBS Studio.
    *   In the URL, use the IP address you noted, followed by the server port and the `index.html` file. For example: `http://192.168.1.100:8989/index.html`.
    *   **Important:** Make sure the gaming PC's firewall is not blocking the port (by default, 8989). You may need to add an exception for port 8989 in Windows Firewall.

## Frequently Asked Questions (FAQ)

### Is using this DPS meter bannable?
These types of tools operate in a "gray area." Unlike hacks or cheats, this meter **does not modify game files, inject code, or alter game memory**. It simply reads network traffic that your computer is already sending and receiving. Historically, tools that only read data without modifying the game have a very low risk of being bannable. However, there is always an inherent risk when using any third-party software. **Use at your own risk.**

### Does it affect my game's performance (FPS)?
No. The performance impact is virtually nil. Packet capture is a passive and very lightweight process that should not affect your FPS or game latency.

### Why does it need to run as administrator?
The meter needs administrator permissions because the Npcap library, used to capture network traffic, requires low-level access to your system's network adapters. Without these permissions, it cannot monitor game packets.

### The meter shows no data, what do I do?
Make sure of the following:
1.  The game is running **before** starting the meter.
2.  You have run the meter **as administrator**.
3.  Your firewall or antivirus is not blocking the connection. Try adding an exception for the meter.
4.  If you have multiple network connections (Ethernet, Wi-Fi, VPN), the meter might be listening on the wrong one. The program tries to detect the correct one automatically, but this is not always perfect.

### Does it work with other games?
No. This meter is specifically designed to decode network packets from a particular game. The data structure of each game is unique, so it will not work with other titles.

## Social Media

[![Twitch](https://img.shields.io/badge/Twitch-9146FF?style=for-the-badge&logo=twitch&logoColor=white)](https://www.twitch.tv/mrsnakevt)
[![Kick](https://img.shields.io/badge/Kick-50FF78?style=for-the-badge&logo=kick&logoColor=white)](https://kick.com/mrsnakevt)
[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/@MrSnake_VT)
[![X (Twitter)](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/MrSnakeVT)
