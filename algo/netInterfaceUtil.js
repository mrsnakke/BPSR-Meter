const { exec } = require('child_process');
const cap = require('cap');

// Filter virtual adapters
const VIRTUAL_KEYWORDS = ['zerotier', 'vmware', 'hyper-v', 'virtual', 'loopback', 'tap', 'bluetooth', 'wan miniport'];

function isVirtual(name) {
    const lower = name.toLowerCase();
    return VIRTUAL_KEYWORDS.some((keyword) => lower.includes(keyword));
}

// Detect TCP traffic for 3 seconds
function detectTraffic(deviceIndex, devices) {
    return new Promise((resolve) => {
        let count = 0;
        try {
            const c = new cap.Cap();
            const buffer = Buffer.alloc(65535);

            const cleanup = () => {
                try {
                    c.close();
                } catch (e) {}
            };

            setTimeout(() => {
                cleanup();
                resolve(count);
            }, 3000);

            if (c.open(devices[deviceIndex].name, 'ip and tcp', 1024 * 1024, buffer) === 'ETHERNET') {
                c.setMinBytes && c.setMinBytes(0);
                c.on('packet', () => count++);
            } else {
                cleanup();
                resolve(0);
            }
        } catch (e) {
            resolve(0);
        }
    });
}

async function findByRoute(devices) {
    try {
        const stdout = await new Promise((resolve, reject) => {
            exec('route print 0.0.0.0', (error, stdout) => {
                if (error) reject(error);
                else resolve(stdout);
            });
        });

        const defaultInterface = stdout
            .split('\n')
            .find((line) => line.trim().startsWith('0.0.0.0'))
            ?.trim()
            .split(/\s+/)[3];

        if (!defaultInterface) return undefined;

        const targetInterface = Object.entries(devices).find(([, device]) =>
            device.addresses.find((address) => address.addr === defaultInterface),
        )?.[0];

        return parseInt(targetInterface);
    } catch (error) {
        return undefined;
    }
}

async function findDefaultNetworkDevice(devices) {
    try {
        // Obtener adaptadores físicos
        const physical = Object.entries(devices).filter(([, device]) => {
            const name = device.description || device.name || '';
            return !isVirtual(name) && device.addresses && device.addresses.length > 0;
        });

        let bestDeviceIndex;

        if (physical.length > 0) {
            // Detectar tráfico en adaptadores físicos
            console.log('Detectando tráfico de red en adaptadores físicos... (3s)');
            const physicalResults = await Promise.all(
                physical.map(async ([index]) => ({
                    index: parseInt(index),
                    packets: await detectTraffic(parseInt(index), devices),
                })),
            );

            // Seleccionar adaptador físico con más tráfico
            const bestPhysical = physicalResults.filter((r) => r.packets > 0).sort((a, b) => b.packets - a.packets)[0];

            if (bestPhysical) {
                console.log(`Usando adaptador físico con más tráfico: ${bestPhysical.index} - ${devices[bestPhysical.index].description} (${bestPhysical.packets} paquetes)`);
                bestDeviceIndex = bestPhysical.index;
            }
        }

        if (bestDeviceIndex === undefined) {
            // Si no se encontró un adaptador físico con tráfico, intentar con todos los adaptadores (incluyendo virtuales)
            console.log('No se detectó tráfico en adaptadores físicos. Detectando tráfico en todos los adaptadores... (3s)');
            const allResults = await Promise.all(
                Object.entries(devices).map(async ([index]) => ({
                    index: parseInt(index),
                    packets: await detectTraffic(parseInt(index), devices),
                })),
            );

            // Seleccionar adaptador con más tráfico de entre todos
            const bestOverall = allResults.filter((r) => r.packets > 0).sort((a, b) => b.packets - a.packets)[0];

            if (bestOverall) {
                console.log(`Usando adaptador con más tráfico (incluyendo virtuales): ${bestOverall.index} - ${devices[bestOverall.index].description} (${bestOverall.packets} paquetes)`);
                bestDeviceIndex = bestOverall.index;
            }
        }

        if (bestDeviceIndex !== undefined) {
            return bestDeviceIndex;
        }

        // Fallback a la tabla de rutas si aún no se ha encontrado nada
        console.log('No se detectó tráfico en ningún adaptador. Recurriendo a la tabla de rutas...');
        const routeIndex = await findByRoute(devices);
        if (routeIndex !== undefined && devices[routeIndex] && isVirtual(devices[routeIndex].description || '')) {
            console.log('La tabla de rutas seleccionó un adaptador virtual. Intentando usar el primer adaptador físico si está disponible.');
            if (physical.length > 0) {
                return parseInt(physical[0][0]);
            }
        }

        return routeIndex;
    } catch (error) {
        console.error('Error al encontrar el dispositivo de red predeterminado:', error);
        return undefined;
    }
}

module.exports = findDefaultNetworkDevice;
