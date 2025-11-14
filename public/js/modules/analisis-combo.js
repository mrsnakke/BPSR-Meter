// ASCII-named copy of análisis-combo.js for packaging compatibility
// Copied content with same behavior as the accented file.

// Variables para los elementos del DOM (se inicializarán después de que se cargue el DOM)
let skillAnalysisContainer,
    skillPlayerSelect,
    skillUserNicknameDiv,
    skillUserProfessionDiv,
    fightPointDiv,
    mainSkillNameDiv,
    skillTableBody,
    resetSkillAnalysisButton,
    professionIcon; // Añadir la variable para el icono de profesión
let socket; // Variable global para la conexión WebSocket
let currentSelectedUid = null; // Para rastrear el UID del jugador actualmente seleccionado

// Función para inicializar las variables de los elementos del DOM
function initializeDOMElements() {
    skillAnalysisContainer = document.getElementById('skill-analysis-container');
    skillPlayerSelect = document.getElementById('skillPlayerSelect');
    skillUserNicknameDiv = document.getElementById('skillUserNickname');
    skillUserProfessionDiv = document.getElementById('skillUserProfession');
    fightPointDiv = document.getElementById('fightPoint');
    mainSkillNameDiv = document.getElementById('mainSkillName');
    skillTableBody = document.getElementById('skillTableBody');
    resetSkillAnalysisButton = document.getElementById('resetSkillAnalysisButton');
    professionIcon = document.getElementById('profession-icon'); // Inicializar el elemento del icono
    // Return whether the essential elements were found
    return !!(skillAnalysisContainer && skillPlayerSelect && skillUserNicknameDiv && skillTableBody);
}

// Función para formatear estadísticas (asumiendo que ya existe en BPSR.js, si no, se puede duplicar o importar)
function formatStat(value) {
    if (!value && value !== 0) return '-';
    if (value >= 1000000000000) {
        return Math.floor((value / 1000000000000) * 10) / 10 + 'T';
    }
    if (value >= 1000000000) {
        return Math.floor((value / 1000000000) * 10) / 10 + 'G';
    }
    if (value >= 1000000) {
        return Math.floor((value / 1000000) * 10) / 10 + 'M';
    }
    if (value >= 1000) {
        return Math.floor((value / 1000) * 10) / 10 + 'k';
    }
    return Math.floor(value).toFixed(0);
}

// Función para limpiar la información del jugador y la tabla de habilidades
function clearSkillDisplay() {
    if (!initializeDOMElements()) {
        console.warn('clearSkillDisplay: skill UI not initialized yet');
        return;
    }
    skillUserProfessionDiv.textContent = '-';
    fightPointDiv.textContent = '-';
    mainSkillNameDiv.textContent = 'N/A';
    if (skillTableBody) skillTableBody.innerHTML = `<tr><td colspan="8">Select a player to view skill breakdown.</td></tr>`;
    if (professionIcon) {
        professionIcon.src = ''; // Limpiar la imagen del icono
        professionIcon.alt = 'Profession Icon';
        professionIcon.style.display = 'none';
    }
}

// Function to update the user interface with skill data
function updateSkillUI(skillData, allUserData) {
    try {
        if (!skillData || !allUserData) return;
        console.log('updateSkillUI - skillData.skills:', skillData.skills); // Debugging
        const user = allUserData.user[skillData.uid];
        // The main skill is directly in the user object, not in user.total_damage
        const mainSkill = user ? user.mainSkill : null;

        if (!initializeDOMElements()) {
            console.warn('updateSkillUI: skill UI not initialized yet, skipping update');
            return;
        }

        skillUserNicknameDiv.textContent = user ? user.name : '-';
        const professionName = user ? user.profession : 'Desconocido'; // Obtener el nombre de la profesión (clave)
        console.log(`[DEBUG SkillAnalysis] Raw professionName: ${professionName}`);

        let displayProfession = professionName; // Valor por defecto
        if (window.professionMap && window.defaultProfession) {
            const profParts = professionName.split('-');
            const mainProfKey = profParts[0];
            const subProfKey = profParts.length > 1 ? profParts[1] : null;

            console.log(`[DEBUG SkillAnalysis] mainProfKey: ${mainProfKey}, subProfKey: ${subProfKey}`);

            let mainProfEntry = window.professionMap[mainProfKey];
            let subProfEntry = subProfKey ? window.professionMap[subProfKey] : null;

            let mainProfName = mainProfEntry ? mainProfEntry.name : null;
            let subProfName = subProfEntry ? subProfEntry.name : null;

            console.log(`[DEBUG SkillAnalysis] mainProfName: ${mainProfName}, subProfName: ${subProfName}`);

            // Lógica para determinar el nombre a mostrar
            if (mainProfKey === '未知') { // Si la profesión principal es "Desconocido"
                if (subProfName) {
                    displayProfession = subProfName;
                } else {
                    displayProfession = window.defaultProfession.name;
                }
            } else { // Si la profesión principal es conocida
                if (mainProfName && subProfName) {
                    displayProfession = `${mainProfName} - ${subProfName}`;
                } else if (mainProfName) {
                    displayProfession = mainProfName;
                } else if (subProfName) { // Fallback a la sub-profesión si la principal no está mapeada
                    displayProfession = subProfName;
                } else {
                    displayProfession = window.defaultProfession.name;
                }
            }
        }
        console.log(`[DEBUG SkillAnalysis] Final displayProfession: ${displayProfession}`);
        skillUserProfessionDiv.textContent = displayProfession;
        fightPointDiv.textContent = user ? formatStat(user.fightPoint || 0) : '-';
        mainSkillNameDiv.textContent = mainSkill ? `${mainSkill.name} (${mainSkill.percentage.toFixed(2)}%)` : 'N/A';

        // Actualizar el icono de la profesión
        if (professionIcon && window.professionMap && window.defaultProfession) {
            const profParts = professionName.split('-');
            const mainProfKey = profParts[0];
            const subProfKey = profParts.length > 1 ? profParts[1] : null;

            let profEntry = null;

            // Prioridad para el icono: sub-profesión si la principal es "未知", o si la sub-profesión es más específica
            if (mainProfKey === '未知' && subProfKey) {
                profEntry = window.professionMap[subProfKey];
            }
            
            // Si no se encontró por sub-profesión o la principal no es "未知", intentar con la principal
            if (!profEntry) {
                profEntry = window.professionMap[mainProfKey];
            }

            // Fallback a la profesión por defecto si no se encuentra nada
            if (!profEntry) {
                profEntry = window.defaultProfession;
            }
            
            console.log(`[DEBUG SkillAnalysis] Icon profEntry name: ${profEntry.name}, icon: ${profEntry.icon}`);
            professionIcon.src = `/icons/${profEntry.icon}`;
            professionIcon.alt = `${profEntry.name} Icon`;
            professionIcon.style.display = '';
        } else {
            if (professionIcon) {
                professionIcon.src = '';
                professionIcon.alt = 'Profession Icon Not Available';
                professionIcon.style.display = 'none';
            }
        }

        if (!skillTableBody) initializeDOMElements();

        // Recopilar todas las skills y ordenarlas por totalDamage antes de renderizar
        const skillsArray = [];
        for (const skillId in skillData.skills) {
            const skill = skillData.skills[skillId];
            if (skill) {
                skillsArray.push({ skillId, ...skill });
            }
        }
        // Ordenar por totalDamage en orden descendente (mayor daño primero)
        skillsArray.sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));

        skillTableBody.innerHTML = '';
        for (const skillEntry of skillsArray) {
            const skillId = skillEntry.skillId;
            const skill = skillEntry;
            if (skill) {
                const row = skillTableBody.insertRow();
                row.insertCell().textContent = skill.displayName;
                row.insertCell().textContent = skill.type; // El tipo sigue siendo texto
                const elementCell = row.insertCell();
                const elementImg = document.createElement('img');
                const rawElementName = (skill.elementype || 'General').toString();
                // Normalizar a lowercase para comparar y mapear a los nombres reales de archivo
                const elementKey = rawElementName.trim().toLowerCase();
                // Mapa explícito basado en los ficheros presentes en public/icons/Element
                const ELEMENT_FILE_MAP = {
                    'dark': 'Dark.webp',
                    'earth': 'Earth.webp',
                    'fire': 'Fire.webp',
                    'forest': 'Forest.webp',
                    'general': 'General.webp',
                    'ice': 'Ice.webp',
                    'light': 'LIght.webp', // archivo que tiene una L y una I mayúsculas en el repo
                    'lightning': 'Lightning.webp',
                    'wind': 'Wind.webp'
                };

                const mappedFile = ELEMENT_FILE_MAP[elementKey] || 'General.webp';
                elementImg.src = `/icons/Element/${mappedFile}`;
                elementImg.alt = rawElementName;
                elementImg.classList.add('element-icon');
                elementImg.width = 20;
                elementImg.height = 20;
                // En caso de que el archivo no exista por cualquier razón, usar General.webp
                elementImg.onerror = function() {
                    if (this.src && !this.src.endsWith('/icons/Element/General.webp')) {
                        this.onerror = null;
                        this.src = '/icons/Element/General.webp';
                        this.alt = 'General';
                    }
                };

                const elementNameSpan = document.createElement('span');
                elementNameSpan.textContent = rawElementName; // Mostrar el nombre original del elemento

                elementCell.appendChild(elementImg);
                elementCell.appendChild(elementNameSpan);
                row.insertCell().textContent = (skill.critRate * 100).toFixed(2) + '%';
                row.insertCell().textContent = (skill.luckyRate * 100).toFixed(2) + '%';
                row.insertCell().textContent = formatStat(skill.damageBreakdown.normal);
                row.insertCell().textContent = formatStat(skill.totalDamage);
                row.insertCell().textContent = skill.totalCount;
            } else {
                console.warn(`Skill with ID ${skillId} is null or undefined within skillData.skills.`);
            }
        }
        if (typeof updateWindowSize === 'function') {
            updateWindowSize();
        }

        // Preparar arrays para los datos del gráfico
        const skillNames = [];
        const damages = [];
        const critRates = [];
        const luckyRates = [];

        // Usar el mismo skillsArray que ya está ordenado (declarado arriba)
        // Recopilar datos para los gráficos desde la tabla ya ordenada
        skillsArray.forEach((skill) => {
            const name = skill.displayName || skill.skillId; // Usar skillId si displayName no está disponible
            skillNames.push(name);
            damages.push(skill.totalDamage);
            critRates.push(skill.critRate * 100);
            luckyRates.push(skill.luckyRate * 100);
        });

        // Calcular Main Skill si no viene en user.mainSkill: elegir la skill con mayor totalDamage
        const allDamages = damages.reduce((a, b) => a + b, 0);
        let computedMainSkill = null;
        if (user && user.mainSkill) {
            computedMainSkill = user.mainSkill;
        } else if (skillsArray && skillsArray.length > 0 && allDamages > 0) {
            const top = skillsArray[0]; // Ya está ordenada por totalDamage descendente
            computedMainSkill = {
                name: top.displayName || top.skillId,
                percentage: (top.totalDamage / allDamages) * 100
            };
        }

        if (mainSkillNameDiv) {
            mainSkillNameDiv.textContent = computedMainSkill ? `${computedMainSkill.name} (${computedMainSkill.percentage.toFixed(2)}%)` : 'N/A';
        }

        renderSkillCharts(skillNames, damages, critRates, luckyRates);
    } catch (e) {
        console.error('updateSkillUI error', e);
    }
}

let skillChart1 = null; // Variable global para la instancia del gráfico

// Colores para las skills (pueden ser los mismos que usa ECharts por defecto o un conjunto personalizado)
const SKILL_COLORS = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#5ad8a6'];

// Renderizar gráficos de habilidad
function renderSkillCharts(skillIds, damages, critRates, luckyRates) {
    // Se obtienen las 5 habilidades con mayor daño y se agrupan las demás en "Otros"
    const topNames = skillIds.slice(0, 5);
    const topDamages = damages.slice(0, 5);
    const topAllDamages = topDamages.reduce((a, b) => a + b, 0);
    const allDamages = damages.reduce((a, b) => a + b, 0);
    const otherDamages = allDamages - topAllDamages;

    // Se construye el array de datos para el gráfico de pastel (pieData)
    const pieData = topNames.map((name, idx) => ({
        value: topDamages[idx],
        name: name,
        label: {
            show: true, // Mostrar etiqueta
            position: 'outside', // Fuera del segmento
            formatter: '{b}\n{d}%', // Formato: Nombre\nPorcentaje%
        },
        labelLine: {
            show: true, // Mostrar línea guía
        },
    }));
    if (otherDamages > 0) {
        // Solo añadir "Otros" si hay daño restante
        pieData.push({
            value: otherDamages,
            name: 'Others',
            label: {
                show: true,
                position: 'outside',
                formatter: '{b}\n{d}%',
            },
            labelLine: {
                show: true,
            },
        });
    }

    // Actualizar la lista de top skills
    const topSkillsList = document.getElementById('top-skills-list');
    if (topSkillsList) {
        topSkillsList.innerHTML = ''; // Limpiar la lista existente
        topNames.forEach((name, index) => {
            const listItem = document.createElement('li');
            listItem.textContent = `${name}: ${((topDamages[index] / allDamages) * 100).toFixed(2)}%`;
            listItem.style.color = SKILL_COLORS[index % SKILL_COLORS.length]; // Asignar color
            topSkillsList.appendChild(listItem);
        });
        if (otherDamages > 0) {
            const listItem = document.createElement('li');
            listItem.textContent = `Others: ${((otherDamages / allDamages) * 100).toFixed(2)}%`;
            listItem.style.color = SKILL_COLORS[topNames.length % SKILL_COLORS.length]; // Asignar color para "Others"
            topSkillsList.appendChild(listItem);
        }
    }

    // Destruir instancia existente si la hay
    if (skillChart1) skillChart1.dispose();

    // Inicializar nueva instancia de ECharts en el contenedor 'skillDamageChart'
    const chartDom = document.getElementById('skillDamageChart');
    if (!chartDom) {
        console.error('Contenedor skillDamageChart no encontrado.');
        return;
    }
    skillChart1 = echarts.init(chartDom);

    // Opciones de configuración del gráfico (damageOption)
    const damageOption = {
        animation: false, // Deshabilitar animaciones para evitar el efecto de "reiniciar"
        color: SKILL_COLORS, // Usar los mismos colores para el gráfico de pastel
        tooltip: {
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)',
            backgroundColor: 'rgba(40, 40, 60, 0.9)',
            borderColor: '#3498db',
            textStyle: { color: '#ecf0f1' },
        },
        series: [
            {
                name: 'Skill Value',
                type: 'pie',
                radius: ['40%', '70%'],
                center: ['50%', '50%'],
                avoidLabelOverlap: false,
                itemStyle: {
                    borderRadius: 10,
                    borderColor: '#1a2a6c',
                    borderWidth: 2,
                },
                label: {
                    show: true,
                    position: 'outside',
                    formatter: '{b}\n{d}%',
                    textStyle: {
                        color: '#e2e8f0',
                    },
                },
                emphasis: {
                    label: {
                        show: true,
                        fontSize: '16',
                        fontWeight: 'bold',
                        color: '#e2e8f0',
                    },
                },
                labelLine: {
                    show: true,
                    length: 10,
                    length2: 10,
                    smooth: true,
                },
                data: pieData,
            },
        ],
    };

    // Aplicar las opciones al gráfico
    skillChart1.setOption(damageOption);

    // Manejar el redimensionamiento de la ventana para que el gráfico se ajuste
    window.removeEventListener('resize', resizeSkillChart1); // Eliminar listener anterior para evitar duplicados
    window.addEventListener('resize', resizeSkillChart1);
}

function resizeSkillChart1() {
    if (skillChart1) {
        skillChart1.resize();
    }
}

// Function to load and display skill data for a specific UID (initially)
async function loadSkillDataForPlayer(uid) {
    const numericUid = Number(uid);
    currentSelectedUid = numericUid; // Update the selected UID
    console.log(`[Skill] Cargando datos para UID ${numericUid}`);

    // Detener actualizaciones previas y solicitar nuevas
    if (socket && socket.connected) {
        console.log(`[Skill] Emitiendo requestSkillUpdates para UID ${numericUid}`);
        socket.emit('stopSkillUpdates');
        socket.emit('requestSkillUpdates', numericUid);
    }

    try {
        // Cargar datos iniciales (REST) + datos de usuario
        const [skillRes, dataRes] = await Promise.all([fetch(`/api/skill/${numericUid}`), fetch('/api/data')]);
        const skillData = await skillRes.json();
        const allUserData = await dataRes.json();

        if (skillData.code === 0 && skillData.data) {
            console.log(`[Skill] Datos REST recibidos para UID ${numericUid}, actualizando UI`);
            updateSkillUI(skillData.data, allUserData);
        } else {
            if (skillTableBody) skillTableBody.innerHTML = `<tr><td colspan="8">Error getting skill data: ${skillData.msg}</td></tr>`;
        }
    } catch (error) {
        console.error('Error in loadSkillDataForPlayer:', error);
        if (skillTableBody) skillTableBody.innerHTML = `<tr><td colspan="8">Connection error to skill analysis.</td></tr>`;
    }
}

// Function to initialize the skill analysis view (populate select and load data)
async function initSkillAnalysisView() {
    initializeDOMElements(); // Ensure DOM elements are initialized
    setupResetButton(); // Make sure reset button has handler

    try {
        const dataRes = await fetch('/api/data');
        const userData = await dataRes.json();
        const users = Object.values(userData.user || {});

        // Filter users to ensure they have a valid UID
        const validUsers = users.filter((user) => user && (user.uid !== undefined && user.uid !== null || user.id !== undefined));

        // Populate the select with players
        if (skillPlayerSelect) skillPlayerSelect.innerHTML = '';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a player'; // Default option
        skillPlayerSelect.appendChild(defaultOption);

        if (validUsers.length === 0) {
            skillPlayerSelect.disabled = true; // Disable if no players
        } else {
            skillPlayerSelect.disabled = false;
            validUsers.forEach((user) => {
                const option = document.createElement('option');
                option.value = user.uid ?? user.id;
                option.textContent = user.name || `UID: ${user.uid ?? user.id}`; // Show UID if name is empty
                skillPlayerSelect.appendChild(option);
            });

            // If there are valid users and no previous selection, select the first player by default
            if (!skillPlayerSelect.value && validUsers.length > 0) {
                skillPlayerSelect.value = validUsers[0].uid ?? validUsers[0].id;
                loadSkillDataForPlayer(validUsers[0].uid ?? validUsers[0].id); // Automatically load data for the first player
            }
        }

        // If no value is selected (e.g., no users or default option is selected), clear the screen
        if (!skillPlayerSelect.value) {
            skillPlayerSelect.value = ''; // Ensure the select is on the default option
            clearSkillDisplay(); // Clear the screen at startup
        }

        if (users.length === 0) {
            skillTableBody.innerHTML = `<tr><td colspan="8">No player data available.</td></tr>`;
        }

        // Add event listener for player change
        skillPlayerSelect.addEventListener('change', (event) => {
            const selectedUid = event.target.value;
            if (selectedUid) {
                loadSkillDataForPlayer(selectedUid);
            } else {
                // If deselected, stop WebSocket updates
                if (socket && socket.connected) {
                    socket.emit('stopSkillUpdates');
                }
                currentSelectedUid = null;
                clearSkillDisplay();
            }
        });
    } catch (error) {
        console.error('Error in initSkillAnalysisView:', error);
        if (skillTableBody) skillTableBody.innerHTML = `<tr><td colspan="8">Error loading player list for skill analysis.</td></tr>`;
    }
}

// Asignar el evento de clic al botón de cierre en este módulo
(function attachSocketAndExports(){
    // Reuse global socket if available
    socket = window.__socket || io?.();

    if (socket) {
        socket.on('connect', () => {
            console.log('Conectado al servidor WebSocket para análisis de habilidades.');
            if (currentSelectedUid) {
                socket.emit('requestSkillUpdates', currentSelectedUid);
            }
        });

        socket.on('disconnect', () => {
            console.log('Desconectado del servidor WebSocket para análisis de habilidades.');
        });

        // Escuchar skill_data emitido por el servidor (en tiempo real cada 75ms)
        socket.on('skill_data', async (payload) => {
            try {
                const skillData = payload && payload.code === 0 && payload.data ? payload.data : payload;
                // Compare UIDs numerically to avoid string/number mismatch
                const incomingUid = skillData && skillData.uid !== undefined ? Number(skillData.uid) : null;
                console.log(`[Skill] Recibido skill_data para UID ${incomingUid}, esperando ${currentSelectedUid}`);
                if (skillData && incomingUid !== null && incomingUid === currentSelectedUid) {
                    console.log(`[Skill] Actualizando tabla para UID ${incomingUid}`);
                    const dataRes = await fetch('/api/data');
                    const allUserData = await dataRes.json();
                    updateSkillUI(skillData, allUserData);
                }
            } catch (e) {
                console.error('Error processing skill_data payload', e, payload);
            }
        });

        socket.on('skill_data_error', (err) => {
            console.warn('skill_data_error', err);
            if (skillTableBody) skillTableBody.innerHTML = `<tr><td colspan="8">Error: ${err && err.msg ? err.msg : 'Skill data error'}</td></tr>`;
        });
    } else {
        console.warn('Socket.IO no disponible para Skill Analysis. Live updates no funcionarán.');
    }

    // Exponer las funciones al ámbito global para que puedan ser llamadas desde index.html
    window.initSkillAnalysisView = initSkillAnalysisView; // Exponer para que BPSR.js pueda llamarla al cambiar de modo
    window.clearSkillDisplay = clearSkillDisplay; // Exponer también clearSkillDisplay
    window.stopSkillRealtimeUpdates = () => {
        if (socket && socket.connected) {
            socket.emit('stopSkillUpdates');
        }
        currentSelectedUid = null;
    };
})();

// Setup reset button handler
function setupResetButton() {
    initializeDOMElements(); // Asegurarse de que los elementos del DOM estén inicializados
    if (resetSkillAnalysisButton) {
        // Eliminar cualquier listener existente para evitar duplicados
        resetSkillAnalysisButton.removeEventListener('click', handleResetSkillAnalysis);
        resetSkillAnalysisButton.addEventListener('click', handleResetSkillAnalysis);
    }
}

function handleResetSkillAnalysis() {
    skillPlayerSelect.value = ''; // Resetear el selector del jugador
    clearSkillDisplay(); // Limpiar la UI
    if (socket && socket.connected) {
        socket.emit('stopSkillUpdates'); // Detener actualizaciones de WebSocket
    }
    currentSelectedUid = null; // Resetear el UID seleccionado
    // También podrías querer resetear el gráfico si es necesario
    if (skillChart1) {
        skillChart1.clear(); // Limpiar el gráfico
        skillChart1.setOption({}); // Establecer opciones vacías para asegurar que no se muestre nada
    }
}

// Expose helper to hide module UI
window.hideSkillAnalysis = function(){
    const container = document.getElementById('skill-analysis-container');
    if (container) container.style.display = 'none';
    const bars = document.getElementById('player-bars-container');
    if (bars) bars.style.display = 'block';
    if (window.stopSkillRealtimeUpdates) window.stopSkillRealtimeUpdates();
};

// Optional: auto-init if there's a specific flag
if (window.__autoOpenSkillAnalysis) {
    window.initSkillAnalysisView?.();
}
