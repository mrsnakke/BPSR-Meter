![Portada](portada.png)

# DPS METER by MrSnake

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
- **YouTube:** [MrSnake_VT](https://www.youtube.com/@MrSnake_VT)
- **Kick:** [mrsnakevt](https://kick.com/mrsnakevt)
- **X (Twitter):** [MrSnakeVT](https://x.com/MrSnakeVT)
