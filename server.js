/*
This file is part of BPSR-Meter.

BPSR-Meter is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

BPSR-Meter is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// Cargar variables de entorno desde .env si existe (precedencia: .env < env vars del sistema)
const path_module = require('path');
const fs_check = require('fs');
const envPath = path_module.join(__dirname, '.env');
if (fs_check.existsSync(envPath)) {
  const dotenv = require('dotenv');
  dotenv.config({ path: envPath });
}

const cap = require('cap');
const cors = require('cors');
const readline = require('readline');
const winston = require('winston');
const Transport = require('winston-transport'); // Importar la clase Transport
const zlib = require('zlib');
const express = require('express');
const http = require('http');
const net = require('net');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');
const fsPromises = require('fs').promises;
const PacketProcessor = require('./algo/packet');
const Readable = require('stream').Readable;
const Cap = cap.Cap;
const decoders = cap.decoders;
const PROTOCOL = decoders.PROTOCOL;
const print = console.log;
const app = express();
const { exec } = require('child_process');
const findDefaultNetworkDevice = require('./algo/netInterfaceUtil');

// Transporte personalizado para Winston que emite logs a través de Socket.IO
class SocketIoTransport extends Transport {
    constructor(options) {
        super(options);
        this.io = options.io;
        this.name = 'socketio';
    }

    log(info, callback) {
        setImmediate(() => {
            this.emit('logged', info);
        });

        if (this.io) {
            // Sólo emitir al frontend los logs relevantes para BPTimer o errores
            let messageToSend = info.message || '';
            // El logger puede incluir códigos ANSI (colores) o prefijos como [SERVER_LOG] [WARN]
            // Normalizamos removiendo códigos ANSI y buscando la aparición de [BPTimer] o [BPTimerClient]
            const stripped = String(messageToSend).replace(/\x1b\[[0-9;]*m/g, '');
            const bptimerTag = '[BPTimer]';
            const bptimerClientTag = '[BPTimerClient]';
            let bptimerIndex = stripped.indexOf(bptimerTag);
            let tagLength = bptimerTag.length;
            
            if (bptimerIndex === -1) {
                bptimerIndex = stripped.indexOf(bptimerClientTag);
                tagLength = bptimerClientTag.length;
            }
            
            const isBptimer = bptimerIndex !== -1;
            // Obtener el nivel numérico del log y del transport
            const levels = winston.config.npm.levels; // Usar los niveles estándar de Winston
            const logLevelValue = levels[info.level];
            const transportLevelValue = levels[this.level];

            // Si el nivel del log es menor que el nivel del transport, no lo enviamos
            if (logLevelValue === undefined || transportLevelValue === undefined || logLevelValue > transportLevelValue) {
                callback();
                return;
            }

            // Si es un mensaje de BPTimer, extraemos el contenido relevante
            if (isBptimer) {
                messageToSend = stripped.substring(bptimerIndex + tagLength).trimStart();
            } else {
                // Para otros logs, usamos el mensaje original sin códigos ANSI
                messageToSend = stripped;
            }

            this.io.emit('server_log', {
                level: info.level,
                message: messageToSend,
                timestamp: info.timestamp
            });
        }

        callback();
    }
}

const skillConfig = require('./tables/skill_names.json').skill_names;
const VERSION = '3.1';
const SETTINGS_PATH = path.join('./settings.json');

// Función para enviar el UID del jugador local al proceso principal de Electron
function sendLocalPlayerUidToMain(uid) {
    if (process.send) {
        process.send({ type: 'local-player-uid', uid: uid });
    }
}

let globalSettings = {
    autoClearOnServerChange: true, // Limpiar datos al cambiar de canal/servidor
    autoClearOnTimeout: true, // Revertido a true, para que los datos se limpien después de un tiempo
    onlyRecordEliteDummy: false,
    enableFightLog: false, // Nueva configuración para logs de combate (deshabilitado por defecto)
    enableDpsLog: false,   // Nueva configuración para logs de DPS (deshabilitado por defecto)
    enableHistorySave: false, // Nueva configuración para guardar el historial de datos de usuario (deshabilitado por defecto)
};

let bptimerEnabled = true; // Nueva variable para controlar el envío a bptimer, habilitado por defecto.

let server_port; // Declarar server_port aquí para que sea accesible globalmente

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// 暂停统计状态
let isPaused = false;

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

const NPCAP_INSTALLER_PATH = path.join(__dirname, 'Dist', 'npcap-1.83.exe');

async function checkAndInstallNpcap(logger) {
    try {
        // Intentar listar dispositivos para ver si Npcap está funcionando
        const devices = cap.deviceList();
        if (!devices || devices.length === 0 || devices.every(d => d.name.includes('Loopback'))) {
            throw new Error('Npcap no detectado o no funcional.');
        }
        logger.info('Npcap detectado y funcional.');
        return true;
    } catch (e) {
        logger.warn(`Npcap no detectado o no funcional: ${e.message}`);
        logger.info('Intentando instalar Npcap...');

        if (!fs.existsSync(NPCAP_INSTALLER_PATH)) {
            logger.error(`Instalador de Npcap no encontrado en: ${NPCAP_INSTALLER_PATH}`);
            logger.info('Por favor, instala Npcap manualmente desde la carpeta Dist/ y reinicia la aplicación.');
            return false;
        }

        try {
            logger.info('Ejecutando instalador de Npcap. Por favor, sigue las instrucciones en pantalla.');
            const { spawn } = require('child_process');
            const npcapProcess = spawn(NPCAP_INSTALLER_PATH, [], { detached: true, stdio: 'ignore' });
            npcapProcess.unref(); // Permite que el proceso padre salga mientras el instalador se ejecuta

            logger.info('Npcap installer lanzado. Por favor, instala Npcap y luego reinicia esta aplicación.');
            return false; // Indicar que Npcap no está listo y la aplicación debe salir
        } catch (spawnError) {
            logger.error(`Error al ejecutar el instalador de Npcap: ${spawnError.message}`);
            logger.info('Por favor, instala Npcap manualmente desde la carpeta Dist/ y reinicia la aplicación.');
            return false;
        }
    }
}

function getSubProfessionBySkillId(skillId) {
    switch (skillId) {
        case 1241:
            return '射线';
        case 2307:
        case 2361:
        case 55302:
            return '协奏';
        case 20301:
            return '愈合';
        case 1518:
        case 1541:
        case 21402:
            return '惩戒';
        case 2306:
            return '狂音';
        case 120901:
        case 120902:
            return '冰矛';
        case 1714:
        case 1734:
            return '居合';
        case 44701:
        case 179906:
            return '月刃';
        case 220112:
        case 2203622:
            return '鹰弓';
        case 2292:
        case 1700820:
        case 1700825:
        case 1700827:
            return '狼弓';
        case 1419:
            return '空枪';
        case 1405:
        case 1418:
            return '重装';
        case 2405:
            return '防盾';
        case 2406:
            return '光盾';
        case 1922:
            return '岩盾';
        case 1930:
        case 1931:
        case 1934:
        case 1935:
            return '格挡';
        default:
            return '';
    }
}

class Lock {
    constructor() {
        this.queue = [];
        this.locked = false;
    }

    async acquire() {
        if (this.locked) {
            return new Promise((resolve) => this.queue.push(resolve));
        }
        this.locked = true;
    }

    release() {
        if (this.queue.length > 0) {
            const nextResolve = this.queue.shift();
            nextResolve();
        } else {
            this.locked = false;
        }
    }
}

class StatisticData {
    constructor(user, type, element) {
        this.user = user;
        this.type = type || '';
        this.element = element || '';
        this.stats = {
            normal: 0,
            critical: 0,
            lucky: 0,
            crit_lucky: 0,
            hpLessen: 0, 
            total: 0,
        };
        this.count = {
            normal: 0,
            critical: 0,
            lucky: 0,
            crit_lucky: 0,
            total: 0,
        };
        this.realtimeWindow = [];
        this.timeRange = [];
        this.realtimeStats = {
            value: 0,
            max: 0,
        };
    }

    /** 添加数据记录
     * @param {number} value - 数值
     * @param {boolean} isCrit - 是否为暴击
     * @param {boolean} isLucky - 是否为幸运
     * @param {number} hpLessenValue - 生命值减少量（仅伤害使用）
     */
    addRecord(value, isCrit, isLucky, hpLessenValue = 0) {
        const now = Date.now();


        if (isCrit) {
            if (isLucky) {
                this.stats.crit_lucky += value;
            } else {
                this.stats.critical += value;
            }
        } else if (isLucky) {
            this.stats.lucky += value;
        } else {
            this.stats.normal += value;
        }
        this.stats.total += value;
        this.stats.hpLessen += hpLessenValue;

        if (isCrit) {
            this.count.critical++;
        }
        if (isLucky) {
            this.count.lucky++;
        }
        if (!isCrit && !isLucky) {
            this.count.normal++;
        }
        if (isCrit && isLucky) {
            this.count.crit_lucky++;
        }
        this.count.total++;

        this.realtimeWindow.push({
            time: now,
            value,
        });

        if (this.timeRange[0]) {
            this.timeRange[1] = now;
        } else {
            this.timeRange[0] = now;
        }
    }

    updateRealtimeStats() {
        const now = Date.now();

        while (this.realtimeWindow.length > 0 && now - this.realtimeWindow[0].time > 1000) {
            this.realtimeWindow.shift();
        }

        this.realtimeStats.value = 0;
        for (const entry of this.realtimeWindow) {
            this.realtimeStats.value += entry.value;
        }
        if (this.realtimeStats.value > this.realtimeStats.max) {
            this.realtimeStats.max = this.realtimeStats.value;
        }
    }


    getTotalPerSecond() {
        if (!this.timeRange[0] || !this.timeRange[1]) {
            return 0;
        }
        const totalPerSecond = (this.stats.total / (this.timeRange[1] - this.timeRange[0])) * 1000 || 0;
        if (!Number.isFinite(totalPerSecond)) return 0;
        return totalPerSecond;
    }

    reset() {
        this.stats = {
            normal: 0,
            critical: 0,
            lucky: 0,
            crit_lucky: 0,
            hpLessen: 0,
            total: 0,
        };
        this.count = {
            normal: 0,
            critical: 0,
            lucky: 0,
            crit_lucky: 0,
            total: 0,
        };
        this.realtimeWindow = [];
        this.timeRange = [];
        this.realtimeStats = {
            value: 0,
            max: 0,
        };
    }
}

class UserData {
    constructor(uid) {
        this.uid = uid;
        this.name = '';
        this.damageStats = new StatisticData(this, 'Damage');
        this.healingStats = new StatisticData(this, 'Healing');
        this.takenDamage = 0;
        this.deadCount = 0;
        this.mainProfession = '未知'; // Nueva propiedad para la profesión principal
        this.subProfession = '';
        this.skillUsage = new Map();
        this.fightPoint = 0;
        this.attr = {};
        this.channel = null; // Nuevo campo para el canal
        this.line = null;    // Nuevo campo para la línea
    }

    /** 添加伤害记录
     * @param {number} skillId - 技能ID/Buff ID
     * @param {string} element - 技能元素属性
     * @param {number} damage - 伤害值
     * @param {boolean} isCrit - 是否为暴击
     * @param {boolean} [isLucky] - 是否为幸运
     * @param {boolean} [isCauseLucky] - 是否造成幸运
     * @param {number} hpLessenValue - 生命值减少量
     */
    addDamage(skillId, element, damage, isCrit, isLucky, isCauseLucky, hpLessenValue = 0) {
        this.damageStats.addRecord(damage, isCrit, isLucky, hpLessenValue);
        if (!this.skillUsage.has(skillId)) {
            this.skillUsage.set(skillId, new StatisticData(this, 'Damage', element));
        }
        this.skillUsage.get(skillId).addRecord(damage, isCrit, isCauseLucky, hpLessenValue);
        this.skillUsage.get(skillId).realtimeWindow.length = 0;

        const subProfession = getSubProfessionBySkillId(skillId);
        if (subProfession) {
            this.setSubProfession(subProfession);
        }
    }

    /** 添加治疗记录
     * @param {number} skillId - 技能ID/Buff ID
     * @param {string} element - 技能元素属性
     * @param {number} healing - 治疗值
     * @param {boolean} isCrit - 是否为暴击
     * @param {boolean} [isLucky] - 是否为幸运
     * @param {boolean} [isCauseLucky] - 是否造成幸运
     */
    addHealing(skillId, element, healing, isCrit, isLucky, isCauseLucky) {
        this.healingStats.addRecord(healing, isCrit, isLucky);
        // 记录技能使用情况
        skillId = skillId + 1000000000;
        if (!this.skillUsage.has(skillId)) {
            this.skillUsage.set(skillId, new StatisticData(this, 'Healing', element));
        }
        this.skillUsage.get(skillId).addRecord(healing, isCrit, isCauseLucky);
        this.skillUsage.get(skillId).realtimeWindow.length = 0;

        const subProfession = getSubProfessionBySkillId(skillId - 1000000000);
        if (subProfession) {
            this.setSubProfession(subProfession);
        }
    }

    /** 添加承伤记录
     * @param {number} damage - 承受的伤害值
     * @param {boolean} isDead - 是否致死伤害
     * */
    addTakenDamage(damage, isDead) {
        this.takenDamage += damage;
        if (isDead) this.deadCount++;
    }

    updateRealtimeDps() {
        this.damageStats.updateRealtimeStats();
        this.healingStats.updateRealtimeStats();
    }

    getTotalDps() {
        return this.damageStats.getTotalPerSecond();
    }

    getTotalHps() {
        return this.healingStats.getTotalPerSecond();
    }

    getTotalCount() {
        return {
            normal: this.damageStats.count.normal + this.healingStats.count.normal,
            critical: this.damageStats.count.critical + this.healingStats.count.critical,
            lucky: this.damageStats.count.lucky + this.healingStats.count.lucky,
            crit_lucky: this.damageStats.count.crit_lucky + this.healingStats.count.crit_lucky,
            total: this.damageStats.count.total + this.healingStats.count.total,
        };
    }

    getSummary() {
        return {
            uid: this.uid,
            realtime_dps: this.damageStats.realtimeStats.value,
            realtime_dps_max: this.damageStats.realtimeStats.max,
            total_dps: this.getTotalDps(),
            total_damage: { ...this.damageStats.stats },
            total_count: this.getTotalCount(),
            realtime_hps: this.healingStats.realtimeStats.value,
            realtime_hps_max: this.healingStats.realtimeStats.max,
            total_hps: this.getTotalHps(),
            total_healing: { ...this.healingStats.stats },
            taken_damage: this.takenDamage,
            profession: this.mainProfession + (this.subProfession ? `-${this.subProfession}` : ''),
            name: this.name,
            fightPoint: this.fightPoint,
            hp: this.attr.hp,
            max_hp: this.attr.max_hp,
            dead_count: this.deadCount,
            channel: this.channel, // Incluir channel en el resumen
            line: this.line,       // Incluir line en el resumen
        };
    }

    getSkillSummary() {
        const skills = {};
        for (const [skillId, stat] of this.skillUsage) {
            const total = stat.stats.normal + stat.stats.critical + stat.stats.lucky + stat.stats.crit_lucky;
            const critCount = stat.count.critical;
            const luckyCount = stat.count.lucky;
            const critRate = stat.count.total > 0 ? critCount / stat.count.total : 0;
            const luckyRate = stat.count.total > 0 ? luckyCount / stat.count.total : 0;
            const name = skillConfig[skillId % 1000000000] ?? skillId % 1000000000;
            const elementype = stat.element;

            skills[skillId] = {
                displayName: name,
                type: stat.type,
                elementype: elementype,
                totalDamage: stat.stats.total,
                totalCount: stat.count.total,
                critCount: stat.count.critical,
                luckyCount: stat.count.lucky,
                critRate: critRate,
                luckyRate: luckyRate,
                damageBreakdown: { ...stat.stats },
                countBreakdown: { ...stat.count },
            };
        }
        return skills;
    }

    /** Establecer profesión principal
     * @param {string} mainProfession - Nombre de la profesión principal
     * */
    setMainProfession(mainProfession) {
        if (mainProfession !== this.mainProfession) {
            this.mainProfession = mainProfession;
            // Si la profesión principal cambia, la subprofesión debe resetearse
            this.subProfession = '';
        }
    }

    /** Establecer subprofesión
     * @param {string} subProfession - Nombre de la subprofesión
     * */
    setSubProfession(subProfession) {
        // Solo actualiza si la nueva subprofesión es diferente y no está vacía
        if (subProfession && subProfession !== this.subProfession) {
            this.subProfession = subProfession;
        }
    }

    /** 设置姓名
     * @param {string} name - 姓名
     * */
    setName(name) {
        this.name = name;
    }

    /** 设置用户总评分
     * @param {number} fightPoint - 总评分
     */
    setFightPoint(fightPoint) {
        this.fightPoint = fightPoint;
    }

    /** 设置额外数据
     * @param {string} key
     * @param {any} value
     */
    setAttrKV(key, value) {
        this.attr[key] = value;
    }

    /** 重置数据 预留 */
    reset() {
        this.damageStats.reset();
        this.healingStats.reset();
        this.takenDamage = 0;
        this.skillUsage.clear();
        this.fightPoint = 0;
    }
}

class UserDataManager {
    constructor(logger) {
        this.logger = logger;
        this.users = new Map();
        this.userCache = new Map();
        this.playerMap = new Map();
        this.cacheFilePath = './users.json';
        this.playerMapPath = './player_map.json';

        this.saveThrottleDelay = 2000;
        this.saveThrottleTimer = null;
        this.pendingSave = false;

        this.hpCache = new Map();
        this.startTime = Date.now();

        this.logLock = new Lock();
        this.logDirExist = new Set();

        this.enemyCache = {
            name: new Map(),
            hp: new Map(),
            maxHp: new Map(),
        };

        this.lastAutoSaveTime = 0;
        this.lastLogTime = 0;
        setInterval(() => {
            if (this.lastLogTime < this.lastAutoSaveTime) return;
            this.lastAutoSaveTime = Date.now();
            this.saveAllUserData();
        }, 10 * 1000);
    }

    async initialize() {
        await this.loadUserCache();
        await this.loadPlayerMap();
    }

    async loadPlayerMap() {
        try {
            await fsPromises.access(this.playerMapPath);
            const data = await fsPromises.readFile(this.playerMapPath, 'utf8');
            const mapData = JSON.parse(data);
            this.playerMap = new Map(Object.entries(mapData));
            this.logger.info(`Loaded ${this.playerMap.size} player map entries`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.logger.error('Failed to load player map:', error);
            }
        }
    }

    async loadUserCache() {
        try {
            await fsPromises.access(this.cacheFilePath);
            const data = await fsPromises.readFile(this.cacheFilePath, 'utf8');
            const cacheData = JSON.parse(data);
            this.userCache = new Map(Object.entries(cacheData));
            this.logger.info(`Loaded ${this.userCache.size} user cache entries`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.logger.error('Failed to load user cache:', error);
            }
        }
    }

    async saveUserCache() {
        try {
            const cacheData = Object.fromEntries(this.userCache);
            await fsPromises.writeFile(this.cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf8');
        } catch (error) {
            this.logger.error('Failed to save user cache:', error);
        }
    }

    saveUserCacheThrottled() {
        this.pendingSave = true;

        if (this.saveThrottleTimer) {
            clearTimeout(this.saveThrottleTimer);
        }

        this.saveThrottleTimer = setTimeout(async () => {
            if (this.pendingSave) {
                await this.saveUserCache();
                await this.savePlayerMap();
                this.pendingSave = false;
                this.saveThrottleTimer = null;
            }
        }, this.saveThrottleDelay);
    }

    async forceUserCacheSave() {
        await this.saveAllUserData(this.users, this.startTime);
        if (this.saveThrottleTimer) {
            clearTimeout(this.saveThrottleTimer);
            this.saveThrottleTimer = null;
        }
        if (this.pendingSave) {
            await this.saveUserCache();
            await this.savePlayerMap();
            this.pendingSave = false;
        }
    }

    async savePlayerMap() {
        try {
            const mapData = Object.fromEntries(this.playerMap);
            await fsPromises.writeFile(this.playerMapPath, JSON.stringify(mapData, null, 2), 'utf8');
        } catch (error) {
            this.logger.error('Failed to save player map:', error);
        }
    }

    /** Obtener o crear usuario
     * @param {number} uid - ID de usuario
     * @returns {UserData} - Instancia de datos de usuario
     */
    getUser(uid) {
        if (!this.users.has(uid)) {
            const user = new UserData(uid);
            const uidStr = String(uid);
            const cachedData = this.userCache.get(uidStr);
            if (this.playerMap.has(uidStr)) {
                user.setName(this.playerMap.get(uidStr));
            }
            if (cachedData) {
                if (cachedData.name) {
                    user.setName(cachedData.name);
                }
                if (cachedData.mainProfession) {
                    user.setMainProfession(cachedData.mainProfession);
                }
                if (cachedData.subProfession) {
                    user.setSubProfession(cachedData.subProfession);
                }
                if (cachedData.fightPoint !== undefined && cachedData.fightPoint !== null) {
                    user.setFightPoint(cachedData.fightPoint);
                }
                if (cachedData.maxHp !== undefined && cachedData.maxHp !== null) {
                    user.setAttrKV('max_hp', cachedData.maxHp);
                }
            }
            if (this.hpCache.has(uid)) {
                user.setAttrKV('hp', this.hpCache.get(uid));
            }

            // Cargar channel y line desde la caché si existen
            if (cachedData && cachedData.channel !== undefined && cachedData.channel !== null) {
                user.channel = cachedData.channel;
            }
            if (cachedData && cachedData.line !== undefined && cachedData.line !== null) {
                user.line = cachedData.line;
            }

            this.users.set(uid, user);
        }
        return this.users.get(uid);
    }

    /** Agregar registro de daño
     * @param {number} uid - ID del usuario que inflige el daño
     * @param {number} skillId - ID de la habilidad/Buff
     * @param {string} element - Atributo elemental de la habilidad
     * @param {number} damage - Valor del daño
     * @param {boolean} isCrit - Si es crítico
     * @param {boolean} [isLucky] - Si es de fortuna
     * @param {boolean} [isCauseLucky] - Si causa fortuna
     * @param {number} hpLessenValue - Reducción de vida real
     * @param {number} targetUid - ID del objetivo del daño
     */
    addDamage(uid, skillId, element, damage, isCrit, isLucky, isCauseLucky, hpLessenValue = 0, targetUid) {
        if (isPaused) return;
        if (globalSettings.onlyRecordEliteDummy && targetUid !== 75) return;
        this.lastLogTime = Date.now();
        this.checkTimeoutClear();
        const user = this.getUser(uid);
        user.addDamage(skillId, element, damage, isCrit, isLucky, isCauseLucky, hpLessenValue);
    }

    /** Agregar registro de curación
     * @param {number} uid - ID del usuario que realiza la curación
     * @param {number} skillId - ID de la habilidad/Buff
     * @param {string} element - Atributo elemental de la habilidad
     * @param {number} healing - Valor de la curación
     * @param {boolean} isCrit - Si es crítico
     * @param {boolean} [isLucky] - Si es de fortuna
     * @param {boolean} [isCauseLucky] - Si causa fortuna
     * @param {number} targetUid - ID del objetivo de la curación
     */
    addHealing(uid, skillId, element, healing, isCrit, isLucky, isCauseLucky, targetUid) {
        if (isPaused) return;
        this.lastLogTime = Date.now();
        this.checkTimeoutClear();
        if (uid !== 0) {
            const user = this.getUser(uid);
            user.addHealing(skillId, element, healing, isCrit, isLucky, isCauseLucky);
        }
    }

    /** Agregar registro de daño recibido
     * @param {number} uid - ID del usuario que recibe el daño
     * @param {number} damage - Valor del daño recibido
     * @param {boolean} isDead - Si es daño letal
     * */
    addTakenDamage(uid, damage, isDead) {
        if (isPaused) return;
        this.checkTimeoutClear();
        const user = this.getUser(uid);
        user.addTakenDamage(damage, isDead);
    }

    /** Agregar registro de log
     * @param {string} log - Contenido del log
     * */
    async addLog(log) {
        if (isPaused || !globalSettings.enableFightLog) return;

        const logDir = path.join('./logs', String(this.startTime));
        const logFile = path.join(logDir, 'fight.log');
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${log}\n`;

        await this.logLock.acquire();
        try {
            if (!this.logDirExist.has(logDir)) {
                try {
                    await fsPromises.access(logDir);
                } catch (error) {
                    await fsPromises.mkdir(logDir, { recursive: true });
                }
                this.logDirExist.add(logDir);
            }
            await fsPromises.appendFile(logFile, logEntry, 'utf8');
        } catch (error) {
            this.logger.error('Failed to save log:', error);
        }
        this.logLock.release();
    }

    /** Establecer profesión principal de usuario
     * @param {number} uid - ID de usuario
     * @param {string} mainProfession - Nombre de la profesión principal
     * */
    setMainProfession(uid, mainProfession) {
        const user = this.getUser(uid);
        if (user.mainProfession !== mainProfession) {
            user.setMainProfession(mainProfession);
            this.logger.info(`Found main profession ${mainProfession} for uid ${uid}`);

            // Actualizar caché
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).mainProfession = user.mainProfession;
            this.userCache.get(uidStr).subProfession = user.subProfession;
            this.saveUserCacheThrottled();
        }
    }

    /** Establecer nombre de usuario
     * @param {number} uid - ID de usuario
     * @param {string} name - Nombre
     * */
    setName(uid, name) {
        const user = this.getUser(uid);
        if (user.name !== name) {
            user.setName(name);
            this.logger.info(`Found player name ${name} for uid ${uid}`);

            // Actualizar caché
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).name = name;
            this.playerMap.set(uidStr, name);
            this.saveUserCacheThrottled();
        }
    }

    /** Establecer puntuación de combate de usuario
     * @param {number} uid - ID de usuario
     * @param {number} fightPoint - Puntuación de combate
     */
    setFightPoint(uid, fightPoint) {
        const user = this.getUser(uid);
        if (user.fightPoint != fightPoint) {
            user.setFightPoint(fightPoint);
            this.logger.info(`Found fight point ${fightPoint} for uid ${uid}`);

            // Actualizar caché
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).fightPoint = fightPoint;
            this.saveUserCacheThrottled();
        }
    }

    /** Establecer datos adicionales
     * @param {number} uid - ID de usuario
     * @param {string} key
     * @param {any} value
     */
    setAttrKV(uid, key, value) {
        const user = this.getUser(uid);
        user.attr[key] = value;

        if (key === 'max_hp') {
            // Actualizar caché
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).maxHp = value;
            this.saveUserCacheThrottled();
        } else if (key === 'hp') {
            this.hpCache.set(uid, value);
        } else if (key === 'channel') {
            user.channel = value;
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).channel = value;
            this.saveUserCacheThrottled();
        } else if (key === 'line') {
            user.line = value;
            const uidStr = String(uid);
            if (!this.userCache.has(uidStr)) {
                this.userCache.set(uidStr, {});
            }
            this.userCache.get(uidStr).line = value;
            this.saveUserCacheThrottled();
        }
    }

    /** Actualizar DPS y HPS en tiempo real para todos los usuarios */
    updateAllRealtimeDps() {
        for (const user of this.users.values()) {
            user.updateRealtimeDps();
        }
    }

    /** Obtener datos de habilidad de usuario
     * @param {number} uid - ID de usuario
     */
    getUserSkillData(uid) {
        const user = this.users.get(uid);
        if (!user) return null;

        return {
            uid: user.uid,
            name: user.name,
            profession: user.profession + (user.subProfession ? `-${user.subProfession}` : ''),
            skills: user.getSkillSummary(),
            attr: user.attr,
        };
    }

    /** Obtener datos de todos los usuarios */
    getAllUsersData() {
        const result = {};
        for (const [uid, user] of this.users.entries()) {
            result[uid] = user.getSummary();
        }
        return result;
    }

    /** Obtener todos los datos de caché de enemigos */
    getAllEnemiesData() {
        const result = {};
        const enemyIds = new Set([...this.enemyCache.name.keys(), ...this.enemyCache.hp.keys(), ...this.enemyCache.maxHp.keys()]);
        enemyIds.forEach((id) => {
            result[id] = {
                name: this.enemyCache.name.get(id),
                hp: this.enemyCache.hp.get(id),
                max_hp: this.enemyCache.maxHp.get(id),
            };
        });
        return result;
    }

    /** Limpiar caché de enemigos */
    refreshEnemyCache() {
        this.enemyCache.name.clear();
        this.enemyCache.hp.clear();
        this.enemyCache.maxHp.clear();
    }

    /** Limpiar todos los datos de usuario */
    clearAll() {
        const usersToSave = this.users;
        const saveStartTime = this.startTime;
        this.users = new Map();
        this.startTime = Date.now();
        this.lastAutoSaveTime = 0;
        this.lastLogTime = 0;
        this.saveAllUserData(usersToSave, saveStartTime);
    }

    /** Obtener lista de IDs de usuario */
    getUserIds() {
        return Array.from(this.users.keys());
    }

    /** Guardar todos los datos de usuario en el historial
     * @param {Map} usersToSave - Mapa de datos de usuario a guardar
     * @param {number} startTime - Hora de inicio de los datos
     */
    async saveAllUserData(usersToSave = null, startTime = null) {
        if (!globalSettings.enableHistorySave) return; // No guardar historial si la configuración está deshabilitada

        try {
            const endTime = Date.now();
            const users = usersToSave || this.users;
            const timestamp = startTime || this.startTime;
            const logDir = path.join('./logs', String(timestamp));
            const usersDir = path.join(logDir, 'users');
            const summary = {
                startTime: timestamp,
                endTime,
                duration: endTime - timestamp,
                userCount: users.size,
                version: VERSION,
            };

            const allUsersData = {};
            const userDatas = new Map();
            for (const [uid, user] of users.entries()) {
                allUsersData[uid] = user.getSummary();

                const userData = {
                    uid: user.uid,
                    name: user.name,
                    profession: user.profession + (user.subProfession ? `-${user.subProfession}` : ''),
                    skills: user.getSkillSummary(),
                    attr: user.attr,
                };
                userDatas.set(uid, userData);
            }

            try {
                await fsPromises.access(usersDir);
            } catch (error) {
                await fsPromises.mkdir(usersDir, { recursive: true });
            }

            // Guardar resumen de todos los datos de usuario
            const allUserDataPath = path.join(logDir, 'allUserData.json');
            await fsPromises.writeFile(allUserDataPath, JSON.stringify(allUsersData, null, 2), 'utf8');

            // Guardar datos detallados de cada usuario
            for (const [uid, userData] of userDatas.entries()) {
                const userDataPath = path.join(usersDir, `${uid}.json`);
                await fsPromises.writeFile(userDataPath, JSON.stringify(userData, null, 2), 'utf8');
            }

            await fsPromises.writeFile(path.join(logDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

            this.logger.debug(`Saved data for ${summary.userCount} users to ${logDir}`);
        } catch (error) {
            this.logger.error('Failed to save all user data:', error);
            throw error;
        }
    }

    checkTimeoutClear() {
        if (!globalSettings.autoClearOnTimeout || this.lastLogTime === 0 || this.users.size === 0) return;
        const currentTime = Date.now();
        if (this.lastLogTime && currentTime - this.lastLogTime > 20000) {
            this.clearAll();
            this.logger.info('Timeout reached, statistics cleared!');
        }
    }

    getGlobalSettings() {
        return globalSettings;
    }
}

async function main() {
    // Declaración de server e io (movido al principio para que logger tenga acceso)
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    const logger = winston.createLogger({
        level: 'debug', // Establecer el nivel de log global a 'debug' para capturar todos los logs
        format: winston.format.combine(
            winston.format.colorize({ all: true }),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf((info) => {
                return `[${info.timestamp}] [${info.level}] ${info.message}`;
            }),
        ),
        transports: [
            new winston.transports.Console({ level: 'debug' }), // La consola mostrará debug y superiores
            new SocketIoTransport({ io: io, level: 'debug' }) // Socket.IO emitirá logs de debug y superiores
        ],
    });

    const npcapReady = await checkAndInstallNpcap(logger);
    if (!npcapReady) {
        rl.close();
        process.exit(1); // Salir si Npcap no está listo
    }

    const devices = cap.deviceList(); // Obtener la lista de dispositivos DESPUÉS de verificar Npcap

    console.clear();
    print('###################################################');
    print('#                                                 #');
    print('#             BPSR Meter - Iniciando              #');
    print('#                                                 #');
    print('###################################################');
    print('\nIniciando servicio...');
    print('Detectando tráfico de red, por favor espera...');


    // Obtener número de dispositivo y nivel de log desde los argumentos de la línea de comandos
    const args = process.argv.slice(2);
    let current_arg_index = 0;

    // Si el primer argumento es un número, asumimos que es el puerto
    if (args[current_arg_index] && !isNaN(parseInt(args[current_arg_index]))) {
        server_port = parseInt(args[current_arg_index]);
        current_arg_index++;
    }
    // Si server_port aún no está definido (no se pasó como argumento), se le asigna el valor predeterminado más adelante.

    let num = args[current_arg_index];
    let log_level = args[current_arg_index + 1];

    // Detección automática de forma continua.
    if (num === undefined || num === 'auto') {
        let deviceFound = false;
        while (!deviceFound) {
            const device_num = await findDefaultNetworkDevice(devices);
            if (device_num !== undefined) {
                num = device_num;
                deviceFound = true;
            } else {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos antes de reintentar
            }
        }
    }

    // Si la detección automática falla y no se proporciona un argumento, el programa se detendrá más adelante.
    if (num === undefined || !devices[num]) {
        logger.error('No se pudo detectar automáticamente una interfaz de red válida.');
        logger.error('Asegúrate de que el juego se esté ejecutando e inténtalo de nuevo.');
        logger.info('\nInterfaces de red disponibles:');
        devices.forEach((device, i) => {
            logger.info(`  ${i}: ${device.name} - ${device.description || 'N/A'}`);
        });
        logger.info('\nPor favor, intenta iniciar el programa con un número de interfaz específico, por ejemplo: node server.js [puerto] [numero_interfaz]');
        await new Promise(resolve => setTimeout(resolve, 10000)); // Esperar 10 segundos para que el usuario lea el mensaje
        process.exit(1);
    }
    // El nivel de log de la consola ya está configurado a 'debug'
    // Eliminar la línea que lo sobrescribe
    
    const userDataManager = new UserDataManager(logger);

    // Inicialización asíncrona del gestor de datos de usuario
    await userDataManager.initialize();

    // Si el puerto no fue pasado como argumento, se usará el predeterminado 8989
    if (server_port === undefined || server_port === null) {
        server_port = 8989;
    }

    // Configuración de Express y Socket.IO
    app.use(cors());
    app.use(express.json()); // Parsear cuerpo de solicitud JSON
    app.use(express.static(path.join(__dirname, 'public'))); // Servir archivos estáticos
    
    // Obtener la API Key de bptimer: prioridad ENV -> keytar (OS secure store) -> build-config.js (empaquetado) -> settings.json
    let bptimerApiKey = process.env.BPTIMER_API_KEY || null;
    if (!bptimerApiKey) {
        // intentar recuperar desde el almacén seguro del sistema usando keytar
        try {
            const keytar = require('keytar');
            // service: 'bpsr-meter', account: 'bptimer_api_key'
            const secret = await keytar.getPassword('bpsr-meter', 'bptimer_api_key');
            if (secret) {
                bptimerApiKey = secret;
                logger.info('BPTimer API key cargada desde el almacén seguro del sistema.');
            }
        } catch (e) {
            // keytar no disponible o fallo: ignorar
        }
    }

    // Si aún no tenemos la key, intentar desde build-config.js (inyectada en tiempo de empaquetado)
    // Si aún no tenemos la key, intentar desde un archivo privado empaquetado (ej: ./private/bptimer.json)
    // Esto permite inyectar la clave durante el proceso de empaquetado sin dejarla en el repositorio.
    if (!bptimerApiKey) {
        try {
            const privatePath = path.join(__dirname, 'private', 'bptimer.json');
            if (fs.existsSync(privatePath)) {
                try {
                    const raw = fs.readFileSync(privatePath, 'utf8');
                    const obj = JSON.parse(raw || '{}');
                    // soportar varias claves posibles en el JSON
                    const candidate = obj.BPTIMER_API_KEY || obj.bptimerApiKey || obj.api_key || obj.apiKey || null;
                    if (candidate) {
                        bptimerApiKey = candidate;
                        logger.info('BPTimer API key cargada desde private/bptimer.json (paquetada).');
                    }
                } catch (e) {
                    logger.warn('Error leyendo private/bptimer.json: ' + e.message);
                }
            }
        } catch (e) {
            // ignore
        }
    }

    // Si aún no tenemos la key, intentar desde build-config.js (inyectada en tiempo de empaquetado)
    if (!bptimerApiKey) {
        try {
            const buildConfig = require('./public/build-config.js');
            if (buildConfig && buildConfig.BPTIMER_API_KEY) {
                bptimerApiKey = buildConfig.BPTIMER_API_KEY;
                logger.info('BPTimer API key cargada desde configuración de build (app empaquetada).');
            }
        } catch (e) {
            // build-config.js no existe o fallo: ignorar
        }
    }

    // Si aún no tenemos la key, buscar en settings.json (solo como último recurso y migrar a keytar si es posible)
    if (!bptimerApiKey) {
        try {
            if (fs.existsSync(SETTINGS_PATH)) {
                const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
                const settingsObj = JSON.parse(raw || '{}');
                const candidate = settingsObj.bptimerApiKey || settingsObj.bptimer_api_key || null;
                if (candidate) {
                    bptimerApiKey = candidate;
                    logger.info('BPTimer API key encontrada en settings.json.');
                    // Intentar migrar a keytar para no dejar la clave en texto plano
                    try {
                        const keytar = require('keytar');
                        await keytar.setPassword('bpsr-meter', 'bptimer_api_key', bptimerApiKey);
                        // realizar copia de seguridad del settings y remover la clave
                        const backupPath = SETTINGS_PATH + '.bptimerkeybak';
                        fs.writeFileSync(backupPath, raw, 'utf8');
                        delete settingsObj.bptimerApiKey;
                        delete settingsObj.bptimer_api_key;
                        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settingsObj, null, 2), 'utf8');
                        logger.info('BPTimer API key migrada a almacén seguro y eliminada de settings.json (backup creado).');
                    } catch (e) {
                        logger.warn('No se pudo migrar BPTimer API key a almacén seguro: ' + e.message);
                    }
                }
            }
        } catch (e) {
            // ignore
        }
    }

    // Instanciar PacketProcessor, pasándole el callback para el UID del jugador local, la instancia de io y la API Key
    const packetProcessor = new PacketProcessor({
        logger,
        userDataManager,
        onLocalPlayerUidDetected: sendLocalPlayerUidToMain,
        io: io, // Pasar la instancia de socket.io
        bptimerApiKey: bptimerApiKey, // Pasar la API Key
        bptimerEnabled: bptimerEnabled, // Pasar el estado del switch de bptimer
    });

    // Log final state of API key for debugging
    if (bptimerApiKey) {
        logger.info('[BPTimer] API Key initialized (do not log key to avoid exposure)');
    } else {
        logger.error('[BPTimer] No API Key found! BPTimer reports will fail with 403 errors. Please ensure BPTIMER_API_KEY is set in .env, keytar, private/bptimer.json, or settings.json.');
    }

    // Emitir estado de inicialización a todos los clientes conectados
    io.on('connection', (socket) => {
        // Cuando un cliente se conecta, solo notificar si hay problemas
        if (!bptimerApiKey) {
            socket.emit('server_log', {
                level: 'warn',
                message: '[BPTimer] API Key status: NOT FOUND - BPTimer reports will fail',
                timestamp: new Date().toISOString()
            });
        }
    });

    // Guardar caché de usuario al salir del proceso
    process.on('SIGINT', async () => {
        console.log('\nGuardando caché de usuario...');
        await userDataManager.forceUserCacheSave();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('\nGuardando caché de usuario...');
        await userDataManager.forceUserCacheSave();
        process.exit(0);
    });

    // Actualización de DPS instantáneo
    setInterval(() => {
        if (!isPaused) {
            userDataManager.updateAllRealtimeDps();
        }
    }, 50);

    app.get('/icon.png', (req, res) => {
        res.sendFile(path.join(__dirname, 'icon.png'));
    });

    app.get('/favicon.ico', (req, res) => {
        res.sendFile(path.join(__dirname, 'icon.ico'));
    });

    app.get('/api/data', (req, res) => {
        const userData = userDataManager.getAllUsersData();
        const data = {
            code: 0,
            user: userData,
        };
        io.emit('data', data); // Emitir también a través de socket.io
        res.json(data);
    });

    app.get('/api/enemies', (req, res) => {
        const enemiesData = userDataManager.getAllEnemiesData();
        const data = {
            code: 0,
            enemy: enemiesData,
        };
        io.emit('enemies', data); // Emitir también a través de socket.io
        res.json(data);
    });

    app.get('/api/clear', (req, res) => {
        userDataManager.clearAll();
        console.log('¡Estadísticas limpiadas!');
        io.emit('clear_stats', { code: 0, msg: '¡Estadísticas limpiadas!' }); // Emitir también a través de socket.io
        res.json({
            code: 0,
            msg: '¡Estadísticas limpiadas!',
        });
    });

    // Nueva API para limpiar todos los logs guardados
    app.post('/api/clear-logs', async (req, res) => {
        const logsBaseDir = path.join(__dirname, 'logs');
        try {
            const files = await fsPromises.readdir(logsBaseDir);
            for (const file of files) {
                const filePath = path.join(logsBaseDir, file);
                await fsPromises.rm(filePath, { recursive: true, force: true });
            }
            // También eliminar logs_dps.json
            const logsDpsPath = path.join(__dirname, 'logs_dps.json');
            if (fs.existsSync(logsDpsPath)) {
                await fsPromises.unlink(logsDpsPath);
            }
            console.log('¡Todos los archivos y directorios de log han sido limpiados!');
            io.emit('logs_cleared', { code: 0, msg: '¡Todos los archivos y directorios de log han sido limpiados!' }); // Emitir también a través de socket.io
            res.json({
                code: 0,
                msg: '¡Todos los archivos y directorios de log han sido limpiados!',
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('El directorio de logs no existe, no hay logs que limpiar.');
                io.emit('logs_cleared', { code: 0, msg: 'El directorio de logs no existe, no hay logs que limpiar.' }); // Emitir también a través de socket.io
                res.json({
                    code: 0,
                    msg: 'El directorio de logs no existe, no hay logs que limpiar.',
                });
            } else {
                logger.error('Failed to clear log files:', error);
                io.emit('logs_clear_error', { code: 1, msg: 'Failed to clear log files.', error: error.message }); // Emitir también a través de socket.io
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to clear log files.',
                    error: error.message,
                });
            }
        }
    });

    // API para pausar/reanudar estadísticas
    app.post('/api/pause', (req, res) => {
        const { paused } = req.body;
        isPaused = paused;
        console.log(`¡Estadísticas ${isPaused ? 'pausadas' : 'reanudadas'}!`);
        io.emit('pause_status', { code: 0, msg: `¡Estadísticas ${isPaused ? 'pausadas' : 'reanudadas'}!`, paused: isPaused }); // Emitir también a través de socket.io
        res.json({
            code: 0,
            msg: `¡Estadísticas ${isPaused ? 'pausadas' : 'reanudadas'}!`,
            paused: isPaused,
        });
    });

    // API para obtener estado de pausa
    app.get('/api/pause', (req, res) => {
        io.emit('pause_status_request', { code: 0, paused: isPaused }); // Emitir también a través de socket.io
        res.json({
            code: 0,
            paused: isPaused,
        });
    });

    // Endpoint para establecer manualmente el nombre de un usuario
    app.post('/api/set-username', (req, res) => {
        const { uid, name } = req.body;
        if (uid && name) {
            const userId = parseInt(uid, 10);
            if (!isNaN(userId)) {
                userDataManager.setName(userId, name);
                console.log(`Manualmente se asignó el nombre '${name}' al UID ${userId}`);
                io.emit('username_updated', { code: 0, msg: 'Nombre de usuario actualizado correctamente.', uid: userId, name: name }); // Emitir también a través de socket.io
                res.json({ code: 0, msg: 'Nombre de usuario actualizado correctamente.' });
            } else {
                io.emit('username_update_error', { code: 1, msg: 'UID inválido.' }); // Emitir también a través de socket.io
                res.status(400).json({ code: 1, msg: 'UID inválido.' });
            }
        } else {
            io.emit('username_update_error', { code: 1, msg: 'Faltan UID o nombre.' }); // Emitir también a través de socket.io
            res.status(400).json({ code: 1, msg: 'Faltan UID o nombre.' });
        }
    });

    // Obtener datos de habilidad
    app.get('/api/skill/:uid', (req, res) => {
        const uid = parseInt(req.params.uid);
        const skillData = userDataManager.getUserSkillData(uid);

        if (!skillData) {
            io.emit('skill_data_error', { code: 1, msg: 'User not found', uid: uid }); // Emitir también a través de socket.io
            return res.status(404).json({
                code: 1,
                msg: 'User not found',
            });
        }

        io.emit('skill_data', { code: 0, data: skillData }); // Emitir también a través de socket.io
        res.json({
            code: 0,
            data: skillData,
        });
    });

    // Resumen de datos históricos
    app.get('/api/history/:timestamp/summary', async (req, res) => {
        const { timestamp } = req.params;
        const historyFilePath = path.join('./logs', timestamp, 'summary.json');

        try {
            const data = await fsPromises.readFile(historyFilePath, 'utf8');
            const summaryData = JSON.parse(data);
            io.emit('history_summary', { code: 0, data: summaryData }); // Emitir también a través de socket.io
            res.json({
                code: 0,
                data: summaryData,
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('History summary file not found:', error);
                io.emit('history_summary_error', { code: 1, msg: 'History summary file not found', timestamp: timestamp }); // Emitir también a través de socket.io
                res.status(404).json({
                    code: 1,
                    msg: 'History summary file not found',
                });
            } else {
                logger.error('Failed to read history summary file:', error);
                io.emit('history_summary_error', { code: 1, msg: 'Failed to read history summary file', error: error.message, timestamp: timestamp }); // Emitir también a través de socket.io
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to read history summary file',
                });
            }
        }
    });

    // Datos históricos
    app.get('/api/history/:timestamp/data', async (req, res) => {
        const { timestamp } = req.params;
        const historyFilePath = path.join('./logs', timestamp, 'allUserData.json');

        try {
            const data = await fsPromises.readFile(historyFilePath, 'utf8');
            const userData = JSON.parse(data);
            io.emit('history_data', { code: 0, user: userData }); // Emitir también a través de socket.io
            res.json({
                code: 0,
                user: userData,
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('History data file not found:', error);
                io.emit('history_data_error', { code: 1, msg: 'History data file not found', timestamp: timestamp }); // Emitir también a través de socket.io
                res.status(404).json({
                    code: 1,
                    msg: 'History data file not found',
                });
            } else {
                logger.error('Failed to read history data file:', error);
                io.emit('history_data_error', { code: 1, msg: 'Failed to read history data file', error: error.message, timestamp: timestamp }); // Emitir también a través de socket.io
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to read history data file',
                });
            }
        }
    });

    // Obtener datos de habilidad históricos
    app.get('/api/history/:timestamp/skill/:uid', async (req, res) => {
        const { timestamp, uid } = req.params;
        const historyFilePath = path.join('./logs', timestamp, 'users', `${uid}.json`);

        try {
            const data = await fsPromises.readFile(historyFilePath, 'utf8');
            const skillData = JSON.parse(data);
            io.emit('history_skill_data', { code: 0, data: skillData }); // Emitir también a través de socket.io
            res.json({
                code: 0,
                data: skillData,
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('History skill file not found:', error);
                io.emit('history_skill_data_error', { code: 1, msg: 'History skill file not found', timestamp: timestamp, uid: uid }); // Emitir también a través de socket.io
                res.status(404).json({
                    code: 1,
                    msg: 'History skill file not found',
                });
            } else {
                logger.error('Failed to read history skill file:', error);
                io.emit('history_skill_data_error', { code: 1, msg: 'Failed to read history skill file', error: error.message, timestamp: timestamp, uid: uid }); // Emitir también a través de socket.io
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to read history skill file',
                });
            }
        }
    });

    // Descargar datos de log de combate históricos
    app.get('/api/history/:timestamp/download', async (req, res) => {
        const { timestamp } = req.params;
        const historyFilePath = path.join('./logs', timestamp, 'fight.log');
        io.emit('history_download', { code: 0, msg: `Descargando fight_${timestamp}.log` }); // Emitir también a través de socket.io
        res.download(historyFilePath, `fight_${timestamp}.log`);
    });

    // Lista de datos históricos
    app.get('/api/history/list', async (req, res) => {
        try {
            const data = (await fsPromises.readdir('./logs', { withFileTypes: true }))
                .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
                .map((e) => e.name);
            io.emit('history_list', { code: 0, data: data }); // Emitir también a través de socket.io
            res.json({
                code: 0,
                data: data,
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('History path not found:', error);
                io.emit('history_list_error', { code: 1, msg: 'History path not found' }); // Emitir también a través de socket.io
                res.status(404).json({
                    code: 1,
                    msg: 'History path not found',
                });
            } else {
                logger.error('Failed to load history path:', error);
                io.emit('history_list_error', { code: 1, msg: 'Failed to load history path', error: error.message }); // Emitir también a través de socket.io
                res.status(500).json({
                    code: 1,
                    msg: 'Failed to load history path',
                });
            }
        }
    });

    // Interfaz de configuración
    app.get('/api/settings', async (req, res) => {
        io.emit('settings_data', { code: 0, data: globalSettings }); // Emitir también a través de socket.io
        res.json({ code: 0, data: globalSettings });
    });

    app.post('/api/settings', async (req, res) => {
        const newSettings = req.body;
        globalSettings = { ...globalSettings, ...newSettings };
        await fsPromises.writeFile(SETTINGS_PATH, JSON.stringify(globalSettings, null, 2), 'utf8');
        io.emit('settings_updated', { code: 0, data: globalSettings }); // Emitir también a través de socket.io
        res.json({ code: 0, data: globalSettings });
    });

    // Nueva API para alternar el envío a BPTimer
    app.post('/api/bptimer-toggle', (req, res) => {
        const { enabled } = req.body;
        if (typeof enabled === 'boolean') {
            bptimerEnabled = enabled;
            packetProcessor.setBptimerEnabled(bptimerEnabled); // Actualizar el estado en PacketProcessor
            console.log(`Envío a BPTimer ${bptimerEnabled ? 'habilitado' : 'deshabilitado'}.`);
            io.emit('bptimer_toggle_status', { code: 0, msg: `Envío a BPTimer ${bptimerEnabled ? 'habilitado' : 'deshabilitado'}.`, bptimerEnabled: bptimerEnabled }); // Emitir también a través de socket.io
            res.json({ code: 0, msg: `Envío a BPTimer ${bptimerEnabled ? 'habilitado' : 'deshabilitado'}.`, bptimerEnabled: bptimerEnabled });
        } else {
            io.emit('bptimer_toggle_error', { code: 1, msg: 'El parámetro "enabled" debe ser un booleano.' }); // Emitir también a través de socket.io
            res.status(400).json({ code: 1, msg: 'El parámetro "enabled" debe ser un booleano.' });
        }
    });

    // API para obtener el estado actual de bptimerEnabled
    app.get('/api/bptimer-status', (req, res) => {
        io.emit('bptimer_status', { code: 0, bptimerEnabled: bptimerEnabled }); // Emitir también a través de socket.io
        res.json({ code: 0, bptimerEnabled: bptimerEnabled });
    });

    // API para resetear la cache del cliente BPTimer para un monster específico (útil para pruebas)
    app.post('/api/bptimer-reset', async (req, res) => {
        const { monster_id, line } = req.body || {};
        if (!packetProcessor || !packetProcessor.bptimerClient) {
            res.status(500).json({ code: 1, msg: 'BPTimer client not initialized' });
            return;
        }
        try {
            packetProcessor.bptimerClient.resetMonster(monster_id, line);
            io.emit('bptimer_reset', { code: 0, msg: 'Reset OK', monster_id, line });
            res.json({ code: 0, msg: 'Reset OK', monster_id, line });
        } catch (e) {
            io.emit('bptimer_reset', { code: 1, msg: 'Reset failed', error: e && e.message ? e.message : e });
            res.status(500).json({ code: 1, msg: 'Reset failed', error: e && e.message ? e.message : e });
        }
    });

    // API para forzar un reporte a BPTimer (evita la caché interna). Útil para pruebas.
    app.post('/api/bptimer-force-report', async (req, res) => {
        const payload = req.body || {};
        if (!packetProcessor || !packetProcessor.bptimerClient) {
            res.status(500).json({ code: 1, msg: 'BPTimer client not initialized' });
            return;
        }
        try {
            const result = await packetProcessor.bptimerClient.reportHP(payload);
            io.emit('bptimer_force_report', { code: 0, result });
            res.json({ code: 0, result });
        } catch (e) {
            io.emit('bptimer_force_report', { code: 1, error: e && e.message ? e.message : e });
            res.status(500).json({ code: 1, error: e && e.message ? e.message : e });
        }
    });

    // Nueva API para alternar autoClearOnServerChange
    app.post('/api/toggle-clear-on-server-change', async (req, res) => {
        const { value } = req.body;
        globalSettings.autoClearOnServerChange = value;
        await fsPromises.writeFile(SETTINGS_PATH, JSON.stringify(globalSettings, null, 2), 'utf8');
        io.emit('clear_on_server_change_status', { code: 0, data: globalSettings.autoClearOnServerChange }); // Emitir también a través de socket.io
        res.json({ code: 0, data: globalSettings.autoClearOnServerChange });
    });

    // Ruta para servir el diccionario
    app.get('/api/diccionario', async (req, res) => {
        const diccionarioPath = path.join(__dirname, 'diccionario.json');
        try {
            const data = await fsPromises.readFile(diccionarioPath, 'utf8');
            if (data.trim() === '') { // Si el archivo está vacío
                io.emit('diccionario_data', {}); // Emitir también a través de socket.io
                res.json({});
            } else {
                io.emit('diccionario_data', JSON.parse(data)); // Emitir también a través de socket.io
                res.json(JSON.parse(data));
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('diccionario.json not found, returning empty object.');
                io.emit('diccionario_data', {}); // Emitir también a través de socket.io
                res.json({}); // Si el archivo no existe, devuelve un objeto vacío
            } else {
                logger.error('Failed to read or parse diccionario.json:', error);
                io.emit('diccionario_error', { code: 1, msg: 'Failed to load diccionario', error: error.message }); // Emitir también a través de socket.io
                res.status(500).json({ code: 1, msg: 'Failed to load diccionario', error: error.message });
            }
        }
    });

    // --- Logs de DPS/HPS máximos ---
    const logsPath = path.join(__dirname, 'logs_dps.json');

    function guardarLogDps(log) {
        if (!globalSettings.enableDpsLog) return; // No guardar si la configuración está deshabilitada

        let logs = [];
        if (fs.existsSync(logsPath)) {
            logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
        }
        logs.unshift(log); // Agrega el log más reciente al principio
        fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
        io.emit('dps_log_saved', log); // Emitir también a través de socket.io
    }

    app.post('/guardar-log-dps', (req, res) => {
        const log = req.body;
        guardarLogDps(log);
        res.sendStatus(200);
    });

    app.get('/logs-dps', (req, res) => {
        let logs = [];
        if (fs.existsSync(logsPath)) {
            logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
        }
        io.emit('dps_logs', logs); // Emitir también a través de socket.io
        res.json(logs);
    });

    try {
        await fsPromises.access(SETTINGS_PATH);
        const data = await fsPromises.readFile(SETTINGS_PATH, 'utf8');
        globalSettings = { ...globalSettings, ...JSON.parse(data) };
    } catch (e) {
        if (e.code !== 'ENOENT') {
            logger.error('Failed to load settings:', e);
        }
    }

    const clearDataOnServerChange = () => {
        userDataManager.refreshEnemyCache();
        if (!globalSettings.autoClearOnServerChange || userDataManager.lastLogTime === 0 || userDataManager.users.size === 0) return;
        userDataManager.clearAll();
        console.log('¡Servidor cambiado, estadísticas limpiadas!');
        io.emit('server_change_clear', { msg: '¡Servidor cambiado, estadísticas limpiadas!' }); // Emitir también a través de socket.io
    };

    // Manejo de conexión WebSocket
    const skillUpdateIntervals = {}; // Almacenar intervalos por cliente (socket.id)

    io.on('connection', (socket) => {
        console.log('Cliente WebSocket conectado: ' + socket.id);
        io.emit('client_connected', { id: socket.id, msg: 'Cliente WebSocket conectado' }); // Emitir también a través de socket.io

        // Listener para requestSkillUpdates: inicia envío de datos en tiempo real cada 50-100ms
        socket.on('requestSkillUpdates', (uid) => {
            const numericUid = Number(uid);
            console.log(`[Skill] Cliente ${socket.id} solicita actualizaciones para UID ${numericUid}`);
            
            // Si ya hay un intervalo para este cliente, limpiarlo primero
            if (skillUpdateIntervals[socket.id]) {
                clearInterval(skillUpdateIntervals[socket.id]);
            }

            // Crear intervalo que envía datos cada 75ms (entre 50-100ms)
            skillUpdateIntervals[socket.id] = setInterval(() => {
                const skillData = userDataManager.getUserSkillData(numericUid);
                if (skillData) {
                    // Enviar solo al cliente que solicitó (socket.emit)
                    socket.emit('skill_data', { code: 0, data: skillData });
                } else {
                    socket.emit('skill_data_error', { code: 1, msg: 'User not found', uid: numericUid });
                    // Si no encontró datos, detener el intervalo
                    clearInterval(skillUpdateIntervals[socket.id]);
                    delete skillUpdateIntervals[socket.id];
                }
            }, 75); // 75ms = frecuencia entre 50-100ms solicitada
        });

        // Listener para stopSkillUpdates: detiene envío de datos en tiempo real
        socket.on('stopSkillUpdates', () => {
            console.log(`[Skill] Cliente ${socket.id} detiene actualizaciones`);
            if (skillUpdateIntervals[socket.id]) {
                clearInterval(skillUpdateIntervals[socket.id]);
                delete skillUpdateIntervals[socket.id];
            }
        });

        socket.on('disconnect', () => {
            console.log('Cliente WebSocket desconectado: ' + socket.id);
            // Limpiar intervalos cuando se desconecta
            if (skillUpdateIntervals[socket.id]) {
                clearInterval(skillUpdateIntervals[socket.id]);
                delete skillUpdateIntervals[socket.id];
            }
            io.emit('client_disconnected', { id: socket.id, msg: 'Cliente WebSocket desconectado' }); // Emitir también a través de socket.io
        });
    });

    // Transmitir datos cada 100ms a todos los clientes WebSocket
    setInterval(() => {
        if (!isPaused) {
            const userData = userDataManager.getAllUsersData();
            const data = {
                code: 0,
                user: userData,
            };
            io.emit('data', data);
        }
    }, 50);

    server.listen(server_port, '0.0.0.0', () => {
        // Abrir automáticamente la página web en el navegador predeterminado (compatible con múltiples plataformas)
        const localUrl = `http://localhost:${server_port}`;
        console.log(`Servidor web iniciado en ${localUrl}. Puedes acceder desde esta PC usando ${localUrl}/index.html o desde otra PC usando http://[TU_IP_LOCAL]:${server_port}/index.html`);
        console.log('Servidor WebSocket iniciado');
        io.emit('server_started', { url: localUrl, msg: 'Servidor web y WebSocket iniciado' }); // Emitir también a través de socket.io

        // No abrir el navegador automáticamente, Electron se encargará de esto.
        // La URL se imprimirá en la consola para que Electron pueda capturarla.
    });

    console.log('¡Bienvenido a BPSR Meter!');
    console.log('Detectando servidor de juego, por favor espera...');
    io.emit('app_status', { msg: '¡Bienvenido a BPSR Meter! Detectando servidor de juego, por favor espera...' }); // Emitir también a través de socket.io

    let current_server = '';
    let _data = Buffer.alloc(0);
    let tcp_next_seq = -1;
    let tcp_cache = new Map();
    let tcp_last_time = 0;
    const tcp_lock = new Lock();

    const clearTcpCache = () => {
        _data = Buffer.alloc(0);
        tcp_next_seq = -1;
        tcp_last_time = 0;
        tcp_cache.clear();
    };

    const fragmentIpCache = new Map();
    const FRAGMENT_TIMEOUT = 30000; // Revertido a 30 segundos
    const getTCPPacket = (frameBuffer, ethOffset) => {
        const ipPacket = decoders.IPV4(frameBuffer, ethOffset);
        const ipId = ipPacket.info.id;
        const isFragment = (ipPacket.info.flags & 0x1) !== 0;
        const _key = `${ipId}-${ipPacket.info.srcaddr}-${ipPacket.info.dstaddr}-${ipPacket.info.protocol}`;
        const now = Date.now();

        if (isFragment || ipPacket.info.fragoffset > 0) {
            if (!fragmentIpCache.has(_key)) {
                fragmentIpCache.set(_key, {
                    fragments: [],
                    timestamp: now,
                });
            }

            const cacheEntry = fragmentIpCache.get(_key);
            const ipBuffer = Buffer.from(frameBuffer.subarray(ethOffset));
            cacheEntry.fragments.push(ipBuffer);
            cacheEntry.timestamp = now;

            // hay más paquetes IP fragmentados, esperar el resto
            if (isFragment) {
                return null;
            }

            // último fragmento recibido, reensamblar
            const fragments = cacheEntry.fragments;
            if (!fragments) {
                logger.error(`Can't find fragments for ${_key}`);
                return null;
            }

            // Reensamblar fragmentos basándose en su offset
            let totalLength = 0;
            const fragmentData = [];

            // Recopilar datos de fragmentos con sus offsets
            for (const buffer of fragments) {
                const ip = decoders.IPV4(buffer);
                const fragmentOffset = ip.info.fragoffset * 8;
                const payloadLength = ip.info.totallen - ip.hdrlen;
                const payload = Buffer.from(buffer.subarray(ip.offset, ip.offset + payloadLength));

                fragmentData.push({
                    offset: fragmentOffset,
                    payload: payload,
                });

                const endOffset = fragmentOffset + payloadLength;
                if (endOffset > totalLength) {
                    totalLength = endOffset;
                }
            }

            const fullPayload = Buffer.alloc(totalLength);
            for (const fragment of fragmentData) {
                fragment.payload.copy(fullPayload, fragment.offset);
            }

            fragmentIpCache.delete(_key);
            return fullPayload;
        }

        return Buffer.from(frameBuffer.subarray(ipPacket.offset, ipPacket.offset + (ipPacket.info.totallen - ipPacket.hdrlen)));
    };

    // Relacionado con la captura de paquetes
    const eth_queue = [];
    const c = new Cap();
    const device = devices[num].name;
    const filter = 'ip and tcp';
    const bufSize = 10 * 1024 * 1024;
    const buffer = Buffer.alloc(65535);
    const linkType = c.open(device, filter, bufSize, buffer);
    if (linkType !== 'ETHERNET') {
        logger.error('The device seems to be WRONG! Please check the device! Device type: ' + linkType);
    }
    c.setMinBytes && c.setMinBytes(0);
    c.on('packet', async function (nbytes, trunc) {
        eth_queue.push(Buffer.from(buffer.subarray(0, nbytes)));
    });
    const processEthPacket = async (frameBuffer) => {
        // logger.debug('packet: length ' + nbytes + ' bytes, truncated? ' + (trunc ? 'yes' : 'no'));

        var ethPacket = decoders.Ethernet(frameBuffer);

        if (ethPacket.info.type !== PROTOCOL.ETHERNET.IPV4) return;

        const ipPacket = decoders.IPV4(frameBuffer, ethPacket.offset);
        const srcaddr = ipPacket.info.srcaddr;
        const dstaddr = ipPacket.info.dstaddr;

        const tcpBuffer = getTCPPacket(frameBuffer, ethPacket.offset);
        if (tcpBuffer === null) return;
        const tcpPacket = decoders.TCP(tcpBuffer);

        const buf = Buffer.from(tcpBuffer.subarray(tcpPacket.hdrlen));

        //logger.debug(' from port: ' + tcpPacket.info.srcport + ' to port: ' + tcpPacket.info.dstport);
        const srcport = tcpPacket.info.srcport;
        const dstport = tcpPacket.info.dstport;
        const src_server = srcaddr + ':' + srcport + ' -> ' + dstaddr + ':' + dstport;

        await tcp_lock.acquire();
        if (current_server !== src_server) {
            try {
                // Intentar identificar el servidor a través de un paquete pequeño
                if (buf[4] == 0) {
                    const data = buf.subarray(10);
                    if (data.length) {
                        const stream = Readable.from(data, { objectMode: false });
                        let data1;
                        do {
                            const len_buf = stream.read(4);
                            if (!len_buf) break;
                            data1 = stream.read(len_buf.readUInt32BE() - 4);
                            const signature = Buffer.from([0x00, 0x63, 0x33, 0x53, 0x42, 0x00]); //c3SB??
                            if (Buffer.compare(data1.subarray(5, 5 + signature.length), signature)) break;
                            try {
                                if (current_server !== src_server) {
                                    current_server = src_server;
                                    clearTcpCache();
                                    tcp_next_seq = tcpPacket.info.seqno + buf.length;
                                    clearDataOnServerChange();
                                    console.log('Servidor de juego detectado. Midiendo DPS...');
                                    io.emit('server_detected', { msg: 'Servidor de juego detectado. Midiendo DPS...' }); // Emitir también a través de socket.io
                                }
                            } catch (e) {}
                        } while (data1 && data1.length);
                    }
                }
                // Intentar identificar el servidor a través del paquete de retorno de inicio de sesión (aún necesita pruebas)
                if (buf.length === 0x62) {
                    // prettier-ignore
                    const signature = Buffer.from([
                        0x00, 0x00, 0x00, 0x62,
                        0x00, 0x03,
                        0x00, 0x00, 0x00, 0x01,
                        0x00, 0x11, 0x45, 0x14,//seq?
                        0x00, 0x00, 0x00, 0x00,
                        0x0a, 0x4e, 0x08, 0x01, 0x22, 0x24
                    ]);
                    if (
                        Buffer.compare(buf.subarray(0, 10), signature.subarray(0, 10)) === 0 &&
                        Buffer.compare(buf.subarray(14, 14 + 6), signature.subarray(14, 14 + 6)) === 0
                    ) {
                        if (current_server !== src_server) {
                            current_server = src_server;
                            clearTcpCache();
                            tcp_next_seq = tcpPacket.info.seqno + buf.length;
                            clearDataOnServerChange();
                            console.log('Servidor de juego detectado por paquete de inicio de sesión. Midiendo DPS...');
                            io.emit('server_detected', { msg: 'Servidor de juego detectado por paquete de inicio de sesión. Midiendo DPS...' }); // Emitir también a través de socket.io
                        }
                    }
                }
            } catch (e) {}
            tcp_lock.release();
            return;
        }
        // logger.debug(`packet seq ${tcpPacket.info.seqno >>> 0} size ${buf.length} expected next seq ${((tcpPacket.info.seqno >>> 0) + buf.length) >>> 0}`);
        // Aquí ya son paquetes del servidor identificado
        if (tcp_next_seq === -1) {
            logger.error('Unexpected TCP capture error! tcp_next_seq is -1');
            io.emit('tcp_error', { msg: 'Unexpected TCP capture error! tcp_next_seq is -1' }); // Emitir también a través de socket.io
            if (buf.length > 4 && buf.readUInt32BE() < 0x0fffff) {
                tcp_next_seq = tcpPacket.info.seqno;
            }
        }
        // logger.debug('TCP next seq: ' + tcp_next_seq);
        if ((tcp_next_seq - tcpPacket.info.seqno) << 0 <= 0 || tcp_next_seq === -1) {
            tcp_cache.set(tcpPacket.info.seqno, buf);
        }
        while (tcp_cache.has(tcp_next_seq)) {
            const seq = tcp_next_seq;
            const cachedTcpData = tcp_cache.get(seq);
            _data = _data.length === 0 ? cachedTcpData : Buffer.concat([_data, cachedTcpData]);
            tcp_next_seq = (seq + cachedTcpData.length) >>> 0; //uint32
            tcp_cache.delete(seq);
            tcp_last_time = Date.now();
        }

        while (_data.length > 4) {
            let packetSize = _data.readUInt32BE();

            if (_data.length < packetSize) break;

            if (_data.length >= packetSize) {
                const packet = _data.subarray(0, packetSize);
                _data = _data.subarray(packetSize);
                packetProcessor.processPacket(packet); // Usar la instancia existente
            } else if (packetSize > 0x0fffff) {
                logger.error(`Invalid Length!! ${_data.length},${len},${_data.toString('hex')},${tcp_next_seq}`);
                io.emit('packet_error', { msg: `Invalid Length!! ${_data.length},${len},${_data.toString('hex')},${tcp_next_seq}` }); // Emitir también a través de socket.io
                process.exit(1);
                break;
            }
        }
        tcp_lock.release();
    };
    (async () => {
        while (true) {
            if (eth_queue.length) {
                const pkt = eth_queue.shift();
                processEthPacket(pkt);
            } else {
                await new Promise((r) => setTimeout(r, 1));
            }
        }
    })();

    // Limpiar periódicamente la caché de fragmentos IP caducados
    setInterval(async () => {
        const now = Date.now();
        let clearedFragments = 0;
        for (const [key, cacheEntry] of fragmentIpCache) {
            if (now - cacheEntry.timestamp > FRAGMENT_TIMEOUT) {
                fragmentIpCache.delete(key);
                clearedFragments++;
            }
        }
        if (clearedFragments > 0) {
            logger.debug(`Cleared ${clearedFragments} expired IP fragment caches`);
            io.emit('cleared_fragments', { count: clearedFragments, msg: `Cleared ${clearedFragments} expired IP fragment caches` }); // Emitir también a través de socket.io
        }

        if (tcp_last_time && Date.now() - tcp_last_time > FRAGMENT_TIMEOUT) {
            logger.warn('Cannot capture the next packet! Is the game closed or disconnected? seq: ' + tcp_next_seq);
            io.emit('tcp_warning', { msg: 'Cannot capture the next packet! Is the game closed or disconnected?', seq: tcp_next_seq }); // Emitir también a través de socket.io
            current_server = '';
            clearTcpCache();
        }
    }, 10000);
}

if (!zlib.zstdDecompressSync) {
    print('zstdDecompressSync is not available! Please update your Node.js!');
    io.emit('zstd_error', { msg: 'zstdDecompressSync is not available! Please update your Node.js!' }); // Emitir también a través de socket.io
    process.exit(1);
}

main();
