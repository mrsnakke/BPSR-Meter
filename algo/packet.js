'use strict';
const zlib = require('zlib');
const pb = require('./blueprotobuf');
const Long = require('long');
const pbjs = require('protobufjs/minimal');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const os = require('os');

// Archivo para persistir la cola de BPTimer (en el home del usuario)
const BPTIMER_QUEUE_FILE = path.join(os.homedir(), '.bpsr-meter', 'bptimer_queue.json');
// Límites para la cola persistente
const BPTIMER_QUEUE_MAX_ITEMS = 1000; // máximo ítems a conservar
const BPTIMER_QUEUE_TTL_MS = 24 * 60 * 60 * 1000; // TTL por item: 24 horas

const monsterNames = require('../tables/monster_names.json');

// IDs permitidos para enviar a BPTimer (usar solo estos template IDs)
const ALLOWED_BPTIMER_MOB_IDS = new Set([
    10007,10009,10010,10018,10029,10032,10056,10059,10069,10077,10081,10084,10085,10086,10900,10901,10902,10903,10904
]);

// Nombre preferido para algunos template ids (override si difiere de tables/monster_names.json)
// Estos son los nombres exactos que queremos reportar a BPTimer
const MOB_NAME_OVERRIDES = {
    10007: 'Storm Goblin King',
    10009: 'Frost Ogre',
    10010: 'Tempest Ogre',
    10018: 'Inferno Ogre',
    10029: 'Muku King',
    10032: 'Golden Juggernaut',
    10056: 'Brigand Leader',
    10059: 'Muku Chief',
    10069: 'Phantom Arachnocrab',
    10077: 'Venobzzar Incubator',
    10081: 'Iron Fang',
    10084: 'Celestial Flier',
    10085: 'Lizardman King',
    10086: 'Goblin King',
    10900: 'Golden Nappo',
    10901: 'Silver Nappo',
    10902: 'Lovely Boarlet'
};

// Subconjunto de mobs para los que BPTimer requiere posición (coincide con bptimer-api-client/src/constants.ts)
const LOCATION_TRACKED_BPTIMER_MOBS = new Set([10900, 10901, 10904]);

/**
 * Utility class para manejar UUIDs
 */
class UUIDHelper {
  /**
   * Extrae información de un UUID
   * @param {Long/BigInt} uuid - UUID del protocolo
   * @returns {Object} { playerId, entityType, isPlayer, isMonster, isBoss }
   */
  static parseUUID(uuid) {
    const playerId = uuid.shiftRight(16).toNumber();
    const entityType = uuid.toNumber() & 0xFFFF;
    
    return {
      uuid: uuid.toString(),
      playerId,
      entityType,
      isPlayer: entityType === 640,
      isMonster: entityType === 64 || entityType === 32,
      isBoss: entityType === 65,
      typeString: this.getEntityTypeName(entityType)
    };
  }
  
  static getEntityTypeName(entityType) {
    const typeMap = {
      640: 'Player',
      32: 'WeakMonster',
      64: 'Monster',
      65: 'Boss'
    };
    return typeMap[entityType] || `Unknown(${entityType})`;
  }
  
  /**
   * Compara dos UUIDs
   */
  static equals(uuid1, uuid2) {
    if (!uuid1 || !uuid2) return false;
    return uuid1.eq ? uuid1.eq(uuid2) : uuid1 === uuid2;
  }
}

/**
 * Rastreador del UUID local del jugador
 */
class LocalPlayerTracker {
  constructor(logger) {
    this.logger = logger;
    this.uuid = null;
    this.playerId = null;
    this.uuidChangeCallbacks = [];
    this.firstDetectionTime = null;
  }
  
  /**
   * Actualiza el UUID si cambió
   * @returns {boolean} true si hubo cambio
   */
  updateUUID(newUuid) {
    if (this.uuid && UUIDHelper.equals(this.uuid, newUuid)) {
      return false; // Sin cambios
    }
    
    const oldPlayerId = this.playerId;
    this.uuid = newUuid;
    this.playerId = newUuid.shiftRight(16).toNumber();
    
    if (!this.firstDetectionTime) {
      this.firstDetectionTime = Date.now();
      this.logger.info(`🎮 Local player detected! ID: ${this.playerId}`);
    } else if (oldPlayerId !== this.playerId) {
      this.logger.warn(`⚠️ Player ID changed from ${oldPlayerId} to ${this.playerId}`);
      // Esto puede indicar desconexión/reconexión
    }
    
    // Notificar cambios
    this._notifyCallbacks();
    return true;
  }
  
  /**
   * Verifica si es el jugador local
   */
  isLocalPlayer(playerId) {
    return this.playerId !== null && this.playerId === playerId;
  }
  
  /**
   * Obtiene información del jugador local
   */
  getInfo() {
    if (!this.uuid) return null;
    return {
      ...UUIDHelper.parseUUID(this.uuid),
      firstDetectedAt: new Date(this.firstDetectionTime)
    };
  }
  
  /**
   * Registra callback para cambios de UUID
   */
  onChange(callback) {
    this.uuidChangeCallbacks.push(callback);
  }
  
  _notifyCallbacks() {
    const info = this.getInfo();
    this.uuidChangeCallbacks.forEach(cb => cb(info));
  }
}

class BinaryReader {
    constructor(buffer, offset = 0) {
        this.buffer = buffer;
        this.offset = offset;
    }

    readUInt64() {
        const value = this.buffer.readBigUInt64BE(this.offset);
        this.offset += 8;
        return value;
    }

    peekUInt64() {
        return this.buffer.readBigUInt64BE(this.offset);
    }

    readUInt32() {
        const value = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return value;
    }

    peekUInt32() {
        return this.buffer.readUInt32BE(this.offset);
    }

    readInt32() {
        const value = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return value;
    }

    readUInt32LE() {
        const value = this.buffer.readUInt32LE(this.offset);
        this.offset += 4;
        return value;
    }

    peekInt32() {
        return this.buffer.readInt32BE(this.offset);
    }

    readUInt16() {
        const value = this.buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return value;
    }

    peekUInt16() {
        return this.buffer.readUInt16BE(this.offset);
    }

    readBytes(length) {
        const value = this.buffer.subarray(this.offset, this.offset + length);
        this.offset += length;
        return value;
    }

    peekBytes(length) {
        return this.buffer.subarray(this.offset, this.offset + length);
    }

    remaining() {
        return this.buffer.length - this.offset;
    }

    readRemaining() {
        const value = this.buffer.subarray(this.offset);
        this.offset = this.buffer.length;
        return value;
    }
}

const MessageType = {
    None: 0,
    Call: 1,
    Notify: 2,
    Return: 3,
    Echo: 4,
    FrameUp: 5,
    FrameDown: 6,
};

const NotifyMethod = {
    SyncNearEntities: 0x00000006,
    SyncContainerData: 0x00000015,
    SyncContainerDirtyData: 0x00000016,
    SyncServerTime: 0x0000002b,
    SyncNearDeltaInfo: 0x0000002d,
    SyncToMeDeltaInfo: 0x0000002e,
};

const AttrType = {
    AttrName: 0x01,
    AttrId: 0x0a,
    AttrProfessionId: 0xdc,
    AttrFightPoint: 0x272e,
    AttrLevel: 0x2710,
    AttrRankLevel: 0x274c,
    AttrCri: 0x2b66,
    AttrLucky: 0x2b7a,
    AttrHp: 0x2c2e,
    AttrMaxHp: 0x2c38,
    AttrElementFlag: 0x646d6c,
    AttrReductionLevel: 0x64696d,
    AttrReduntionId: 0x6f6c65,
    AttrEnergyFlag: 0x543cd3c6,
};

const ProfessionType = {
    雷影剑士: 1,
    冰魔导师: 2,
    涤罪恶火_战斧: 3,
    青岚骑士: 4,
    森语者: 5,
    雷霆一闪_手炮: 8,
    巨刃守护者: 9,
    暗灵祈舞_仪刀_仪仗: 10,
    神射手: 11,
    神盾骑士: 12,
    灵魂乐手: 13,
};

const EDamageSource = {
    EDamageSourceSkill: 0,
    EDamageSourceBullet: 1,
    EDamageSourceBuff: 2,
    EDamageSourceFall: 3,
    EDamageSourceFakeBullet: 4,
    EDamageSourceOther: 100,
};

const EDamageProperty = {
    General: 0,
    Fire: 1,
    Water: 2,
    Electricity: 3,
    Wood: 4,
    Wind: 5,
    Rock: 6,
    Light: 7,
    Dark: 8,
    Count: 9,
};

const getProfessionNameFromId = (professionId) => {
    switch (professionId) {
        case ProfessionType.雷影剑士:
            return '雷影剑士';
        case ProfessionType.冰魔导师:
            return '冰魔导师';
        case ProfessionType.涤罪恶火_战斧:
            return '涤罪恶火·战斧';
        case ProfessionType.青岚骑士:
            return '青岚骑士';
        case ProfessionType.森语者:
            return '森语者';
        case ProfessionType.雷霆一闪_手炮:
            return '雷霆一闪·手炮';
        case ProfessionType.巨刃守护者:
            return '巨刃守护者';
        case ProfessionType.暗灵祈舞_仪刀_仪仗:
            return '暗灵祈舞·仪刀/仪仗';
        case ProfessionType.神射手:
            return '神射手';
        case ProfessionType.神盾骑士:
            return '神盾骑士';
        case ProfessionType.灵魂乐手:
            return '灵魂乐手';
        default:
            return '';
    }
};

const getDamageElement = (damageProperty) => {
    switch (damageProperty) {
        case EDamageProperty.General:
            return 'General';
        case EDamageProperty.Fire:
            return 'Fire';
        case EDamageProperty.Water:
            return 'Ice'; // Nombre del archivo es Ice.webp
        case EDamageProperty.Electricity:
            return 'Lightning';
        case EDamageProperty.Wood:
            return 'Forest'; // Nombre del archivo es Forest.webp
        case EDamageProperty.Wind:
            return 'Wind';
        case EDamageProperty.Rock:
            return 'Earth'; // Nombre del archivo es Earth.webp
        case EDamageProperty.Light:
            return 'Light'; // Ojo: LIght.webp con 'I' mayúscula
        case EDamageProperty.Dark:
            return 'Dark';
        case EDamageProperty.Count:
            return 'Unknown'; // Placeholder
        default:
            return 'General';
    }
};

const getDamageSource = (damageSource) => {
    switch (damageSource) {
        case EDamageSource.EDamageSourceSkill:
            return 'Skill';
        case EDamageSource.EDamageSourceBullet:
            return 'Bullet';
        case EDamageSource.EDamageSourceBuff:
            return 'Buff';
        case EDamageSource.EDamageSourceFall:
            return 'Fall';
        case EDamageSource.EDamageSourceFakeBullet:
            return 'FBullet';
        case EDamageSource.EDamageSourceOther:
            return 'Other';
        default:
            return 'Unknown';
    }
};

// Las funciones isUuidPlayer y isUuidMonster ya no son necesarias, se usará UUIDHelper

const doesStreamHaveIdentifier = (reader) => {
    let identifier = reader.readUInt32LE();
    reader.readInt32();
    if (identifier !== 0xfffffffe) return false;
    identifier = reader.readInt32();
    reader.readInt32();
    //if (identifier !== 0xfffffffd) return false;
    return true;
};

const streamReadString = (reader) => {
    const length = reader.readUInt32LE();
    reader.readInt32();
    const buffer = reader.readBytes(length);
    reader.readInt32();
    return buffer.toString();
};

// let currentUserUuid = Long.ZERO; // Ya no es necesario, lo manejará LocalPlayerTracker

// Safe loader for BPTimerClient: try normal require, then a direct CJS bundle require,
// and finally fall back to dynamic import (async). This prevents startup crash when
// the package is published as ESM-only and the app uses CommonJS require.
let BPTimerClient = null;
try {
    // Intenta cargar el módulo directamente.
    const mod = require('@woheedev/bptimer-api-client');
    BPTimerClient = mod && (mod.BPTimerClient || mod.default || mod);
} catch (e) {
    // Si falla, BPTimerClient permanecerá nulo y se intentará la importación dinámica más tarde.
    // Esto es para manejar casos donde el paquete es ESM-only en un contexto CommonJS.
    BPTimerClient = null;
}

// Función auxiliar para extraer posición desde un AttrCollection
function extractPosFromAttrCollection(attrCollection) {
  if (!attrCollection) return null;

  // 1) Buscar en MapAttrs (MapAttr -> MapAttrValue.Key/Value)
  if (Array.isArray(attrCollection.MapAttrs) && attrCollection.MapAttrs.length) {
    for (const mapAttr of attrCollection.MapAttrs) {
      if (!mapAttr.Attrs || !Array.isArray(mapAttr.Attrs)) continue;
      for (const mv of mapAttr.Attrs) {
        try {
          const key = mv.Key ? Buffer.from(mv.Key).toString() : null;
          if (!key) continue;
          const k = key.toLowerCase();
          if (k.includes('pos') || k.includes('position') || k.includes('pos_x')) {
            // Intentar leer 3 floats (X,Y,Z) desde mv.Value
            if (!mv.Value) continue;
            const reader = pbjs.Reader.create(mv.Value);
            // Muchos layouts usan 3 floats consecutivos
            const x = reader.float();
            const y = reader.float();
            const z = reader.float();
            if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
              return { x, y, z };
            }
          }
        } catch (e) {
          // ignore parse error y continuar buscando
        }
      }
    }
  }

  // 2) Buscar en Attr.RawData (algunas veces la posición viene embebida en un Attr específico)
  if (Array.isArray(attrCollection.Attrs)) {
    for (const attr of attrCollection.Attrs) {
      if (!attr.RawData) continue;
      try {
        const r = pbjs.Reader.create(attr.RawData);
        // Intentar leer 3 floats desde el principio. Si el layout difiere, esto fallará y se capturará.
        const x = r.float();
        const y = r.float();
        const z = r.float();
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          return { x, y, z };
        }
      } catch (e) {
        // no es el layout esperado
      }
    }
  }

  return null;
}

class PacketProcessor {
    constructor({ logger, userDataManager, onLocalPlayerUidDetected, io, bptimerApiKey, bptimerEnabled }) {
        this.logger = logger;
        this.userDataManager = userDataManager;
        this.onLocalPlayerUidDetected = onLocalPlayerUidDetected;
        this.io = io; // Guardar la instancia de socket.io
        this.bptimerEnabled = bptimerEnabled; // Estado inicial del switch de BPTimer

        // Inicializar trackers
        this.localPlayerTracker = new LocalPlayerTracker(logger);
        // this.teamManager = new TeamManager(logger); // Se agregará en un paso posterior

        // Setupear listeners
        this.localPlayerTracker.onChange((info) => {
            this.logger.info(`📍 Local player: ${info.playerId}`);
            if (this.onLocalPlayerUidDetected) {
                this.onLocalPlayerUidDetected(info.playerId);
            }
        });

        // Cola para reportes a BPTimer cuando el cliente no esté listo aún
        this._bptimerQueue = [];
        this._bptimerInitializing = false;
        // Intentar cargar cola persistente desde disco
        try {
            if (fs.existsSync(BPTIMER_QUEUE_FILE)) {
                const raw = fs.readFileSync(BPTIMER_QUEUE_FILE, 'utf8');
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    // Normalizar (soportar formatos antiguos donde se guardaba sólo payload)
                    const now = Date.now();
                    this._bptimerQueue = arr.map(item => {
                        if (item && item.payload !== undefined && item.ts !== undefined) return item;
                        // formato antiguo: item es payload directamente
                        return { payload: item, ts: now };
                    });
                    this._pruneBPTimerQueue();
                    this.logger.info(`Cargada cola de BPTimer desde disco: ${this._bptimerQueue.length} items`);
                }
            }
        } catch (e) {
            this.logger.warn('No se pudo cargar cola persistente de BPTimer: ' + e.message);
            this._bptimerQueue = [];
        }

        // Cola para reportes a BPTimer cuando el cliente no esté listo aún
        this._bptimerQueue = [];
        this._bptimerInitializing = false;
        // Intentar cargar cola persistente desde disco
        try {
            if (fs.existsSync(BPTIMER_QUEUE_FILE)) {
                const raw = fs.readFileSync(BPTIMER_QUEUE_FILE, 'utf8');
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    // Normalizar (soportar formatos antiguos donde se guardaba sólo payload)
                    const now = Date.now();
                    this._bptimerQueue = arr.map(item => {
                        if (item && item.payload !== undefined && item.ts !== undefined) return item;
                        // formato antiguo: item es payload directamente
                        return { payload: item, ts: now };
                    });
                    this._pruneBPTimerQueue();
                    this.logger.info(`Cargada cola de BPTimer desde disco: ${this._bptimerQueue.length} items`);
                }
            }
        } catch (e) {
            this.logger.warn('No se pudo cargar cola persistente de BPTimer: ' + e.message);
            this._bptimerQueue = [];
        }

        // Inicializar enemyCache.hp_pct y enemyCache.pos si no existen
        this.userDataManager.enemyCache.hp_pct = this.userDataManager.enemyCache.hp_pct || new Map();
        this.userDataManager.enemyCache.pos = this.userDataManager.enemyCache.pos || new Map();
    // Guardar template id (AttrId) si está disponible
    this.userDataManager.enemyCache.id = this.userDataManager.enemyCache.id || new Map();

        // Inicializar BPTimerClient si se proporciona una clave API
        if (bptimerApiKey) {
            if (BPTimerClient) {
                try {
                    this.bptimerClient = new BPTimerClient({
                        api_url: 'https://db.bptimer.com', // URL de la API por defecto
                        api_key: bptimerApiKey,
                        logger: {
                            info: (message) => this.logger.info(`[BPTimerClient] ${message}`),
                            debug: (message) => this.logger.debug(`[BPTimerClient] ${message}`)
                        },
                        log_level: 'debug' // Cambiado a 'debug' para más logs
                    });
                    this.logger.info('BPTimerClient inicializado con API Key (no se muestra la clave completa).');
                    // Test connection right after initialization to verify API key/endpoint
                    if (typeof this.bptimerClient.testConnection === 'function') {
                        this.bptimerClient.testConnection().then(r => {
                            const msg = `[BPTimerClient] testConnection result: ${JSON.stringify(r)}`;
                            this.logger.info(msg);
                            // Emitir a navegador
                            if (this.io) {
                                this.io.emit('server_log', {
                                    level: r && r.success ? 'info' : 'warn',
                                    message: msg,
                                    timestamp: new Date().toISOString()
                                });
                            }
                        }).catch(e => {
                            const msg = '[BPTimerClient] testConnection failed: ' + (e && e.message ? e.message : e);
                            this.logger.warn(msg);
                            // Emitir a navegador
                            if (this.io) {
                                this.io.emit('server_log', {
                                    level: 'warn',
                                    message: msg,
                                    timestamp: new Date().toISOString()
                                });
                            }
                        });
                    }
                    // Si había reportes en cola, enviarlos
                    if (this._bptimerQueue.length > 0) this._flushBPTimerQueue();
                } catch (err) {
                    this.bptimerClient = null;
                    this.logger.warn('Error al inicializar BPTimerClient: ' + err.message);
                }
            } else {
                this.bptimerClient = null;
                this.logger.warn('BPTimerClient no disponible sincrónicamente; intentar import dinámico en background.');
                // Intentar import dinámico en background (funciona si el paquete es ESM-only)
                this._bptimerInitializing = true;
                import('@woheedev/bptimer-api-client').then((mod) => {
                    const Cls = mod && (mod.BPTimerClient || mod.default || mod);
                    if (!Cls) {
                        this.logger.warn('BPTimerClient no encontrado tras import dinámico.');
                        this._bptimerInitializing = false;
                        return;
                    }
                    try {
                        this.bptimerClient = new Cls({
                            api_url: 'https://db.bptimer.com',
                            api_key: bptimerApiKey,
                            logger: {
                                info: (message) => this.logger.info(`[BPTimerClient] ${message}`),
                                debug: (message) => this.logger.debug(`[BPTimerClient] ${message}`)
                            },
                            log_level: 'debug'
                        });
                        this.logger.info('BPTimerClient inicializado vía import dinámico con API Key (no se muestra la clave completa).');
                        // Test connection after dynamic import
                        if (typeof this.bptimerClient.testConnection === 'function') {
                            this.bptimerClient.testConnection().then(r => {
                                const msg = `[BPTimerClient] testConnection result: ${JSON.stringify(r)}`;
                                this.logger.info(msg);
                                // Emitir a navegador
                                if (this.io) {
                                    this.io.emit('server_log', {
                                        level: r && r.success ? 'info' : 'warn',
                                        message: msg,
                                        timestamp: new Date().toISOString()
                                    });
                                }
                            }).catch(e => {
                                const msg = '[BPTimerClient] testConnection failed: ' + (e && e.message ? e.message : e);
                                this.logger.warn(msg);
                                // Emitir a navegador
                                if (this.io) {
                                    this.io.emit('server_log', {
                                        level: 'warn',
                                        message: msg,
                                        timestamp: new Date().toISOString()
                                    });
                                }
                            });
                        }
                        // Import dinámico completado: enviar cualquier reporte pendiente
                        this._bptimerInitializing = false;
                        if (this._bptimerQueue.length > 0) this._flushBPTimerQueue();
                    } catch (e) {
                        this._bptimerInitializing = false;
                        this.logger.warn('Error al inicializar BPTimerClient tras import dinámico: ' + e.message);
                    }
                }).catch((err) => {
                    this._bptimerInitializing = false;
                    this.logger.warn('Import dinámico de BPTimerClient falló: ' + err.message);
                });
            }
        } else {
            this.bptimerClient = null;
            this.logger.warn('BPTimerClient no inicializado: bptimerApiKey no proporcionada.');
        }
    }

    /**
     * Vacía la cola de reportes a BPTimer cuando el cliente está disponible.
     */
    _flushBPTimerQueue() {
        if (!this.bptimerClient) return;
        // Enviar elementos respetando formato { payload, ts }
        while (this._bptimerQueue.length > 0) {
            const entry = this._bptimerQueue.shift();
            if (!entry) continue;
            const { payload, ts } = entry;
            // Saltar items expirados
            if (ts && (Date.now() - ts) > BPTIMER_QUEUE_TTL_MS) {
                this.logger.info('Descartando reporte en cola por TTL expirado.');
                continue;
            }
            try {
                this.logger.info(`[BPTimer] Enviando reporte en cola: ${JSON.stringify(payload)}`);
                this.bptimerClient.reportHP(payload).catch(e => {
                    this.logger.error(`Error al enviar reporte en cola a BPTimer: ${e.message}`);
                });
            } catch (e) {
                this.logger.error(`Fallo al procesar un reporte en cola: ${e.message}`);
            }
        }
        // Actualizar almacenamiento en disco (escribir cola actual, probablemente vacía)
        // Escribir la representación serializable (array de {payload,ts})
        fsPromises.mkdir(path.dirname(BPTIMER_QUEUE_FILE), { recursive: true }).then(() => {
            return fsPromises.writeFile(BPTIMER_QUEUE_FILE, JSON.stringify(this._bptimerQueue), 'utf8');
        }).catch((e) => {
            this.logger.warn('No se pudo actualizar el archivo de cola de BPTimer: ' + e.message);
        });
    }

    async _saveBPTimerQueueToDisk() {
        try {
            await fsPromises.mkdir(path.dirname(BPTIMER_QUEUE_FILE), { recursive: true });
            await fsPromises.writeFile(BPTIMER_QUEUE_FILE, JSON.stringify(this._bptimerQueue), 'utf8');
        } catch (e) {
            this.logger.warn('Fallo al guardar la cola de BPTimer en disco: ' + e.message);
        }
    }

    _pruneBPTimerQueue() {
        const now = Date.now();
        // eliminar por TTL
        this._bptimerQueue = this._bptimerQueue.filter(entry => {
            if (!entry) return false;
            if (!entry.ts) return true; // conservar si no hay ts (compatibilidad)
            return (now - entry.ts) <= BPTIMER_QUEUE_TTL_MS;
        });
        // limitar tamaño: conservar los más recientes (los últimos items)
        if (this._bptimerQueue.length > BPTIMER_QUEUE_MAX_ITEMS) {
            const start = this._bptimerQueue.length - BPTIMER_QUEUE_MAX_ITEMS;
            this._bptimerQueue = this._bptimerQueue.slice(start);
        }
    }

    _decompressPayload(buffer) {
        if (!zlib.zstdDecompressSync) {
            this.logger.warn('zstdDecompressSync is not available! Please check your Node.js version!');
            return;
        }
        return zlib.zstdDecompressSync(buffer);
    }

    _processAoiSyncDelta(aoiSyncDelta) {
        if (!aoiSyncDelta) return;

        let targetUuid = aoiSyncDelta.Uuid;
        if (!targetUuid) return;
        const tgtUuid = targetUuid.toString();
        const targetUuidInfo = UUIDHelper.parseUUID(targetUuid); // Usar UUIDHelper
        const isTargetPlayer = targetUuidInfo.isPlayer;
        const isTargetMonster = targetUuidInfo.isMonster;
        // targetUuid = targetUuid.shiftRight(16); // Ya no es necesario reasignar, usar targetUuidInfo.playerId

        const attrCollection = aoiSyncDelta.Attrs;
        if (attrCollection && attrCollection.Attrs) {
            if (isTargetPlayer) {
                this._processPlayerAttrs(targetUuid.toNumber(), attrCollection.Attrs);
            } else if (isTargetMonster) {
                this._processEnemyAttrs(tgtUuid, targetUuid.toNumber(), attrCollection.Attrs);
            }
        }

        const BuffEffectSync = aoiSyncDelta.BuffEffect;
        if (isTargetMonster && BuffEffectSync && BuffEffectSync.BuffEffects) {
            const BuffEffects = BuffEffectSync.BuffEffects;
            for (const BuffEffect of BuffEffects) {
            }
        }

        const skillEffect = aoiSyncDelta.SkillEffects;
        if (!skillEffect) return;

        if (!skillEffect.Damages) return;
        for (const syncDamageInfo of skillEffect.Damages) {
            const skillId = syncDamageInfo.OwnerId;
            if (!skillId) continue;

            let attackerUuid = syncDamageInfo.TopSummonerId || syncDamageInfo.AttackerUuid;
            if (!attackerUuid) continue;
            const attackerUuidInfo = UUIDHelper.parseUUID(attackerUuid); // Usar UUIDHelper
            const atkUuid = attackerUuidInfo.uuid;
            const isAttackerPlayer = attackerUuidInfo.isPlayer;
            const attackerPlayerId = attackerUuidInfo.playerId;
            // attackerUuid = attackerUuid.shiftRight(16); // Ya no es necesario reasignar

            const value = syncDamageInfo.Value;
            const luckyValue = syncDamageInfo.LuckyValue;
            const damage = value ?? luckyValue ?? Long.ZERO;
            if (damage.isZero()) continue;

            // syncDamageInfo.IsCrit doesn't seem to be set by server, use typeFlag instead
            // const isCrit = syncDamageInfo.IsCrit !== null ? syncDamageInfo.IsCrit : false;

            // TODO: from testing, first bit is set when there's crit, 3rd bit for lucky, require more testing here
            const isCrit = syncDamageInfo.TypeFlag != null ? (syncDamageInfo.TypeFlag & 1) === 1 : false;
            const isCauseLucky = syncDamageInfo.TypeFlag != null ? (syncDamageInfo.TypeFlag & 0b100) === 0b100 : false;

            const isMiss = syncDamageInfo.IsMiss != null ? syncDamageInfo.IsMiss : false;
            const isHeal = syncDamageInfo.Type === pb.EDamageType.Heal;
            const isDead = syncDamageInfo.IsDead != null ? syncDamageInfo.IsDead : false;
            const isLucky = !!luckyValue;
            const hpLessenValue = syncDamageInfo.HpLessenValue != null ? syncDamageInfo.HpLessenValue : Long.ZERO;
            const damageElement = getDamageElement(syncDamageInfo.Property);
            const damageSource = syncDamageInfo.DamageSource ?? 0;

            if (isTargetPlayer) {
                //玩家目标
                if (isHeal) {
                    //玩家被治疗
                    this.userDataManager.addHealing(
                        isAttackerPlayer ? attackerPlayerId : 0,
                        skillId,
                        damageElement,
                        damage.toNumber(),
                        isCrit,
                        isLucky,
                        isCauseLucky,
                        targetUuidInfo.playerId, // Usar targetUuidInfo.playerId
                    );
                } else {
                    //玩家受到伤害
                    this.userDataManager.addTakenDamage(targetUuidInfo.playerId, damage.toNumber(), isDead); // Usar targetUuidInfo.playerId
                }
                if (isDead) {
                    this.userDataManager.setAttrKV(targetUuidInfo.playerId, 'hp', 0); // Usar targetUuidInfo.playerId
                }
            } else {
                //非玩家目标
                if (isHeal) {
                    //no jugador curado
                } else {
                    //no jugador dañado
                    if (isAttackerPlayer) {
                        // Registrar daño de todos los jugadores
                        this.userDataManager.addDamage(
                            attackerPlayerId,
                            skillId,
                            damageElement,
                            damage.toNumber(),
                            isCrit,
                            isLucky,
                            isCauseLucky,
                            hpLessenValue.toNumber(),
                            targetUuidInfo.playerId, // Usar targetUuidInfo.playerId
                        );
                    }
                }
                if (isDead) {
                    this.userDataManager.enemyCache.hp.set(tgtUuid, 0);
                }
            }

            let extra = [];
            if (isCrit) extra.push('Crit');
            if (isLucky) extra.push('Lucky');
            if (isCauseLucky) extra.push('CauseLucky');
            if (extra.length === 0) extra = ['Normal'];

            const actionType = isHeal ? 'HEAL' : 'DMG';

            let infoStr = `SRC: `;
            if (isAttackerPlayer) {
                const attacker = this.userDataManager.getUser(attackerPlayerId);
                if (attacker.name) {
                    infoStr += attacker.name;
                }
                infoStr += `#${attackerPlayerId}(player)`;
                if (this.localPlayerTracker.isLocalPlayer(attackerPlayerId)) {
                    infoStr += `(local)`;
                }
            } else {
                if (this.userDataManager.enemyCache.name.has(atkUuid)) {
                    infoStr += this.userDataManager.enemyCache.name.get(atkUuid);
                }
                infoStr += `#${attackerPlayerId}(enemy)`;
            }

            let targetName = '';
            if (isTargetPlayer) {
                const target = this.userDataManager.getUser(targetUuidInfo.playerId); // Usar targetUuidInfo.playerId
                if (target.name) {
                    targetName += target.name;
                }
                targetName += `#${targetUuidInfo.playerId}(player)`; // Usar targetUuidInfo.playerId
            } else {
                if (this.userDataManager.enemyCache.name.has(tgtUuid)) {
                    targetName += this.userDataManager.enemyCache.name.get(tgtUuid);
                }
                targetName += `#${targetUuidInfo.playerId}(enemy)`; // Usar targetUuidInfo.playerId
            }
            infoStr += ` TGT: ${targetName}`;

            const dmgLogArr = [
                `[${actionType}]`,
                `DS: ${getDamageSource(damageSource)}`,
                infoStr,
                `ID: ${skillId}`,
                `VAL: ${damage}`,
                `HPLSN: ${hpLessenValue}`,
                `ELEM: ${damageElement.slice(-1)}`,
                `EXT: ${extra.join('|')}`,
            ];
            const dmgLog = dmgLogArr.join(' ');
            this.logger.info(dmgLog);
            this.userDataManager.addLog(dmgLog);
        }
    }

    _processSyncNearDeltaInfo(payloadBuffer) {
        const syncNearDeltaInfo = pb.SyncNearDeltaInfo.decode(payloadBuffer);
        // this.logger.debug(JSON.stringify(syncNearDeltaInfo, null, 2));

        if (!syncNearDeltaInfo.DeltaInfos) return;
        for (const aoiSyncDelta of syncNearDeltaInfo.DeltaInfos) {
            this._processAoiSyncDelta(aoiSyncDelta);
        }
    }

    _processSyncToMeDeltaInfo(payloadBuffer) {
        const syncToMeDeltaInfo = pb.SyncToMeDeltaInfo.decode(payloadBuffer);
        // this.logger.debug(JSON.stringify(syncToMeDeltaInfo, null, 2));

        const aoiSyncToMeDelta = syncToMeDeltaInfo.DeltaInfo;

        if (aoiSyncToMeDelta.Uuid) {
            // Actualizar UUID local
            this.localPlayerTracker.updateUUID(aoiSyncToMeDelta.Uuid);
        }

        const aoiSyncDelta = aoiSyncToMeDelta.BaseDelta;
        if (!aoiSyncDelta) return;

        this._processAoiSyncDelta(aoiSyncDelta);
    }

    _processSyncContainerData(payloadBuffer) {
        // for some reason protobufjs doesn't work here, we use google-protobuf instead
        try {
            const syncContainerData = pb.SyncContainerData.decode(payloadBuffer);
            // this.logger.debug(JSON.stringify(syncContainerData, null, 2));
            // fs.writeFileSync('SyncContainerData.json', JSON.stringify(syncContainerData, null, 2));

            if (!syncContainerData.VData) return;
            const vData = syncContainerData.VData;

            if (!vData.CharId) return;
            const playerUid = vData.CharId.toNumber();

            if (vData.RoleLevel && vData.RoleLevel.Level) this.userDataManager.setAttrKV(playerUid, 'level', vData.RoleLevel.Level);

            if (vData.Attr && vData.Attr.CurHp) this.userDataManager.setAttrKV(playerUid, 'hp', vData.Attr.CurHp.toNumber());

            if (vData.Attr && vData.Attr.MaxHp) this.userDataManager.setAttrKV(playerUid, 'max_hp', vData.Attr.MaxHp.toNumber());

            // Extraer LineId y Posición XYZ
            let lineId = null;
            let position = null;
            
            // helper: coerce various protobuf number-like shapes to JS number or null
            const _toNumber = (val) => {
                if (val == null) return null;
                if (typeof val === 'number') return val;
                if (typeof val === 'bigint') return Number(val);
                if (typeof val === 'string') {
                    const n = Number(val);
                    return Number.isNaN(n) ? null : n;
                }
                if (typeof val.toNumber === 'function') {
                    try {
                        return val.toNumber();
                    } catch (e) {
                        return null;
                    }
                }
                // protobufjs sometimes returns plain objects with lowercase keys
                if (val && typeof val === 'object' && ('low' in val || 'high' in val)) {
                    try {
                        // Use Long.fromBits if available
                        if (Long && typeof Long.fromBits === 'function') {
                            return Long.fromBits(val.low || 0, val.high || 0).toNumber();
                        }
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            };

            if (vData.SceneData) {
                // Extraer LineId desde SceneData
                let rawLine = vData.SceneData.LineId ?? vData.SceneData.lineid ?? vData.SceneData.lineId ?? vData.SceneData.line;
                lineId = _toNumber(rawLine);
                
                if (vData.SceneData.Pos) {
                    const pos = vData.SceneData.Pos;
                    position = {
                        x: _toNumber(pos.X ?? pos.x),
                        y: _toNumber(pos.Y ?? pos.y),
                        z: _toNumber(pos.Z ?? pos.z)
                    };
                }
            }

            // Use cached values as fallback to avoid overwriting valid stored data with null
            const cachedUser = this.userDataManager.getUser ? this.userDataManager.getUser(playerUid) : null;
            const playerInfo = {
                uid: playerUid,
                line: lineId != null ? lineId : (cachedUser && cachedUser.line != null ? cachedUser.line : null),
                position: position,
                isLocalPlayer: this.localPlayerTracker.isLocalPlayer(playerUid) // Añadir esta línea
            };
            this.logger.info(`[PLAYER_INFO] UID: ${playerInfo.uid}, Line: ${playerInfo.line}, Position: X=${playerInfo.position ? playerInfo.position.x : 'N/A'}, Y=${playerInfo.position ? playerInfo.position.y : 'N/A'}, Z=${playerInfo.position ? playerInfo.position.z : 'N/A'}, IsLocal: ${playerInfo.isLocalPlayer}`);
            this.logger.info(`[PLAYER_INFO Debug] Line: ${playerInfo.line}, Position: ${JSON.stringify(playerInfo.position)}`);
            
            // Emitir la información al frontend a través de socket.io
            if (this.io) {
                this.io.emit('player_info', playerInfo);
            }

            // Actualizar la información de línea en UserDataManager sólo si viene valor válido
            if (lineId != null) {
                this.userDataManager.setAttrKV(playerUid, 'line', lineId);
            }

            if (!vData.CharBase) return;
            const charBase = vData.CharBase;

            if (charBase.Name) {
                this.logger.debug(`_processSyncContainerData: Setting player name for UID ${playerUid}: ${charBase.Name}`);
                this.userDataManager.setName(playerUid, charBase.Name);
            }

            if (charBase.AccountId) {
                this.userDataManager.setAttrKV(playerUid, 'account_id', charBase.AccountId);
            }

            if (charBase.FightPoint) this.userDataManager.setFightPoint(playerUid, charBase.FightPoint);

            if (!vData.ProfessionList) return;
            const professionList = vData.ProfessionList;
            if (professionList.CurProfessionId) {
                const professionName = getProfessionNameFromId(professionList.CurProfessionId);
                this.logger.debug(`_processSyncContainerData: Setting profession for UID ${playerUid}: ${professionName}`);
                this.userDataManager.getUser(playerUid).setMainProfession(professionName);
            }
        } catch (err) {
            fs.writeFileSync('./SyncContainerData.dat', payloadBuffer);
            const playerIdentifier = this.localPlayerTracker.playerId ? this.localPlayerTracker.playerId.toString() : 'Unknown';
            this.logger.warn(`Failed to decode SyncContainerData for player ${playerIdentifier}. Please report to developer`);
            throw err;
        }
    }

    _processSyncContainerDirtyData(payloadBuffer) {
        const localPlayerInfo = this.localPlayerTracker.getInfo();
        if (!localPlayerInfo || !localPlayerInfo.uuid) return; // No procesar si no hay jugador local

        const syncContainerDirtyData = pb.SyncContainerDirtyData.decode(payloadBuffer);
        if (!syncContainerDirtyData.VData || !syncContainerDirtyData.VData.Buffer) return;
        this.logger.debug(syncContainerDirtyData.VData.Buffer.toString('hex'));
        const messageReader = new BinaryReader(Buffer.from(syncContainerDirtyData.VData.Buffer));

        if (!doesStreamHaveIdentifier(messageReader)) return;

        let fieldIndex = messageReader.readUInt32LE();
        messageReader.readInt32();
        switch (fieldIndex) {
            case 2: // CharBase
                if (!doesStreamHaveIdentifier(messageReader)) break;

                fieldIndex = messageReader.readUInt32LE();
                messageReader.readInt32();
                switch (fieldIndex) {
                    case 5: // Name
                        const playerName = streamReadString(messageReader);
                        if (!playerName || playerName === '') break;
                        this.userDataManager.setName(localPlayerInfo.playerId, playerName);
                        break;
                    case 35: // FightPoint
                        const fightPoint = messageReader.readUInt32LE();
                        messageReader.readInt32();
                        this.userDataManager.setFightPoint(localPlayerInfo.playerId, fightPoint);
                        break;
                    default:
                        // unhandle
                        break;
                }
                break;
            case 16: // UserFightAttr
                if (!doesStreamHaveIdentifier(messageReader)) break;

                fieldIndex = messageReader.readUInt32LE();
                messageReader.readInt32();
                switch (fieldIndex) {
                    case 1: // CurHp
                        const curHp = messageReader.readUInt32LE();
                        this.userDataManager.setAttrKV(localPlayerInfo.playerId, 'hp', curHp);
                        break;
                    case 2: // MaxHp
                        const maxHp = messageReader.readUInt32LE();
                        this.userDataManager.setAttrKV(localPlayerInfo.playerId, 'max_hp', maxHp);
                        break;
                    default:
                        // unhandle
                        break;
                }
                break;
            case 61: // ProfessionList
                if (!doesStreamHaveIdentifier(messageReader)) break;

                fieldIndex = messageReader.readUInt32LE();
                messageReader.readInt32();
                switch (fieldIndex) {
                    case 1: // CurProfessionId
                        const curProfessionId = messageReader.readUInt32LE();
                        messageReader.readInt32();
                        if (curProfessionId)
                            this.userDataManager.getUser(localPlayerInfo.playerId).setMainProfession(getProfessionNameFromId(curProfessionId));
                        break;
                    default:
                        // unhandle
                        break;
                }
                break;
            default:
                // unhandle
                break;
        }

        // this.logger.debug(syncContainerDirtyData.VData.Buffer.toString('hex'));
    }

    _processPlayerAttrs(playerUid, attrs) {
        for (const attr of attrs) {
            if (!attr.Id || !attr.RawData) continue;
            const reader = pbjs.Reader.create(attr.RawData);

            switch (attr.Id) {
                case AttrType.AttrName:
                    const playerName = reader.string();
                    this.logger.debug(`_processPlayerAttrs: Setting player name for UID ${playerUid}: ${playerName}`);
                    this.userDataManager.setName(playerUid, playerName);
                    break; // Añadido 'break'

                case AttrType.AttrProfessionId:
                    const professionId = reader.int32();
                    const professionName = getProfessionNameFromId(professionId);
                    this.userDataManager.getUser(playerUid).setMainProfession(professionName);
                    break; // Añadido 'break'

                case AttrType.AttrFightPoint: // AttrFightPoint debe ser un case separado
                    const playerFightPoint = reader.int32(); // Obtener fightPoint del reader
                    this.userDataManager.setFightPoint(playerUid, playerFightPoint);
                    break; // Añadido 'break'

                case AttrType.AttrLevel:
                    const playerLevel = reader.int32();
                    this.userDataManager.setAttrKV(playerUid, 'level', playerLevel);
                    break;
                case AttrType.AttrRankLevel:
                    const playerRankLevel = reader.int32();
                    this.userDataManager.setAttrKV(playerUid, 'rank_level', playerRankLevel);
                    break;
                case AttrType.AttrCri:
                    const playerCri = reader.int32();
                    this.userDataManager.setAttrKV(playerUid, 'cri', playerCri);
                    break;
                case AttrType.AttrLucky:
                    const playerLucky = reader.int32();
                    this.userDataManager.setAttrKV(playerUid, 'lucky', playerLucky);
                    break;
                case AttrType.AttrHp:
                    const playerHp = reader.int32();
                    this.userDataManager.setAttrKV(playerUid, 'hp', playerHp);
                    break;
                case AttrType.AttrMaxHp:
                    const playerMaxHp = reader.int32();
                    this.userDataManager.setAttrKV(playerUid, 'max_hp', playerMaxHp);
                    break;
                case AttrType.AttrElementFlag:
                    const playerElementFlag = reader.int32();
                    this.userDataManager.setAttrKV(playerUid, 'element_flag', playerElementFlag);
                    break;
                case AttrType.AttrEnergyFlag:
                    const playerEnergyFlag = reader.int32();
                    this.userDataManager.setAttrKV(playerUid, 'energy_flag', playerEnergyFlag);
                    break;
                case AttrType.AttrReductionLevel:
                    const playerReductionLevel = reader.int32();
                    this.userDataManager.setAttrKV(playerUid, 'reduction_level', playerReductionLevel);
                    break;
                default:
                    // this.logger.debug(`Found unknown attrId ${attr.Id} for ${playerUid} ${attr.RawData.toString('base64')}`);
                    break;
            }
        }
    }

    _processEnemyAttrs(enemyUuid, enemyUid, attrs) {
        for (const attr of attrs) {
            if (!attr.Id || !attr.RawData) continue;
            const reader = pbjs.Reader.create(attr.RawData);
            this.logger.debug(`Found attrId ${attr.Id} for ${enemyUuid} E${enemyUid} ${attr.RawData.toString('base64')}`);
            switch (attr.Id) {
                case AttrType.AttrName:
                    const enemyName = reader.string();
                    this.userDataManager.enemyCache.name.set(enemyUuid, enemyName);
                    this.logger.info(`Found monster name ${enemyName} for id ${enemyUid} uuid ${enemyUuid}`);
                    break;
                case AttrType.AttrId:
                    const attrId = reader.int32();
                    // attrId es el template id del monstruo (el que corresponde con tables/monster_names.json)
                    // Guardarlo para que los reportes a BPTimer usen el template id en lugar del instance UID
                    try {
                        this.userDataManager.enemyCache.id.set(enemyUuid, attrId);
                    } catch (e) {
                        // en caso de que enemyUuid no sea utilizable como key
                    }
                    const name = monsterNames[attrId];
                    if (name) {
                        this.logger.info(`Found moster name ${name} for templateId ${attrId} (instance ${enemyUid}) uuid ${enemyUuid}`);
                        this.userDataManager.enemyCache.name.set(enemyUuid, name);
                    }
                    break;
                case AttrType.AttrHp: {
                    const enemyHp = reader.int32();
                    this.userDataManager.enemyCache.hp.set(enemyUuid, enemyHp);
                    const maxH = this.userDataManager.enemyCache.maxHp.get(enemyUuid);
                    if (maxH != null && maxH > 0) { // Asegurarse de que maxH no sea null/undefined y sea mayor que 0
                        const pct = Math.round((enemyHp / maxH) * 100);
                        this.userDataManager.enemyCache.hp_pct.set(enemyUuid, pct);
                        this.logger.debug(`[BPTimer Debug] Updated HP for ${enemyUid} (UUID: ${enemyUuid}): HP=${enemyHp}, MaxHP=${maxH}, Pct=${pct}%`);
                    } else {
                        // Si maxH no está disponible o es 0, limpiar hp_pct para evitar valores incorrectos
                        this.userDataManager.enemyCache.hp_pct.delete(enemyUuid);
                        this.logger.debug(`[BPTimer Debug] HP updated for ${enemyUid} (UUID: ${enemyUuid}) but MaxHP is not available or zero. HP=${enemyHp}, MaxHP=${maxH}`);
                    }
                    break;
                }
                case AttrType.AttrMaxHp: {
                    const enemyMaxHp = reader.int32();
                    this.userDataManager.enemyCache.maxHp.set(enemyUuid, enemyMaxHp);
                    const hp = this.userDataManager.enemyCache.hp.get(enemyUuid);
                    if (hp != null && enemyMaxHp > 0) { // Asegurarse de que hp no sea null/undefined y enemyMaxHp sea mayor que 0
                        const pct = Math.round((hp / enemyMaxHp) * 100);
                        this.userDataManager.enemyCache.hp_pct.set(enemyUuid, pct);
                        this.logger.debug(`[BPTimer Debug] Updated MaxHP for ${enemyUid} (UUID: ${enemyUuid}): HP=${hp}, MaxHP=${enemyMaxHp}, Pct=${pct}%`);
                    } else {
                        // Si hp no está disponible o enemyMaxHp es 0, limpiar hp_pct
                        this.userDataManager.enemyCache.hp_pct.delete(enemyUuid);
                        this.logger.debug(`[BPTimer Debug] MaxHP updated for ${enemyUid} (UUID: ${enemyUuid}) but HP is not available or zero. HP=${hp}, MaxHP=${enemyMaxHp}`);
                    }
                    break;
                }
                default:
                    // this.logger.debug(`Found unknown attrId ${attr.Id} for E${enemyUid} ${attr.RawData.toString('base64')}`);
                    break;
            }
        }
        // Extraer posición después de procesar todos los atributos
        const attrCollection = { Attrs: attrs }; // Recrear attrCollection para extractPosFromAttrCollection
        const pos = extractPosFromAttrCollection(attrCollection);
        if (pos) {
            this.userDataManager.enemyCache.pos.set(enemyUuid, pos);
        }
    }

    _processSyncNearEntities(payloadBuffer) {
        const syncNearEntities = pb.SyncNearEntities.decode(payloadBuffer);
        // this.logger.debug(JSON.stringify(syncNearEntities, null, 2));
        if (syncNearEntities.Disappear) {
            for (const entity of syncNearEntities.Disappear) {
                const entityUuid = entity.Uuid;
                if (!entityUuid) continue;
                const entityUuidInfo = UUIDHelper.parseUUID(entityUuid); // Usar UUIDHelper
                if (entityUuidInfo.isMonster) {
                    const entityUid = entityUuidInfo.playerId;
                    if (entity.Type == pb.EDisappearType.EDisappearDead) {
                        this.userDataManager.enemyCache.hp.set(entityUuidInfo.uuid, 0);
                        // También limpiar la posición y el HP% si el monstruo desaparece/muere
                        this.userDataManager.enemyCache.hp_pct.delete(entityUuidInfo.uuid);
                        this.userDataManager.enemyCache.pos.delete(entityUuidInfo.uuid);
                    }
                }
            }
        }
        if (!syncNearEntities.Appear) return;
        for (const entity of syncNearEntities.Appear) {
            const entityUuid = entity.Uuid;
            if (!entityUuid) continue;
            const entityUuidInfo = UUIDHelper.parseUUID(entityUuid); // Usar UUIDHelper
            const entityUid = entityUuidInfo.playerId;
            const attrCollection = entity.Attrs;

            if (attrCollection && attrCollection.Attrs) {
                switch (entity.EntType) {
                    case pb.EEntityType.EntMonster:
                        this._processEnemyAttrs(entityUuidInfo.uuid, entityUid, attrCollection.Attrs);
                        // Después de procesar los atributos, intentar enviar el reporte a BPTimer
                        this._sendBPTimerReport(entityUuidInfo.uuid, entityUid);
                        break;
                    case pb.EEntityType.EntChar:
                        this._processPlayerAttrs(entityUid, attrCollection.Attrs);
                        // Emitir información adicional si es el jugador local
                        if (this.localPlayerTracker.isLocalPlayer(entityUid)) {
                            this.io?.emit('local_player_entity_info', {
                                uid: entityUid,
                                isLocalPlayer: true
                            });
                        }
                        break;
                    default:
                        // this.logger.debug('Get AttrCollection for Unknown EntType' + entity.EntType);
                        break;
                }
            }
        }
    }

    async _sendBPTimerReport(monsterUuid, monsterUid) {
        // Verificar si el envío a BPTimer está habilitado
        if (!this.bptimerEnabled) {
            this.logger.info('[BPTimer] Envío deshabilitado por switch.');
            return;
        }

        const localPlayerInfo = this.localPlayerTracker.getInfo();
        if (!localPlayerInfo) {
            this.logger.info('[BPTimer] No se pudo enviar el reporte: jugador local no detectado.');
            return;
        }

    // Get account_id for the local player (used for region detection)
    const account_id = this.userDataManager.getUser(localPlayerInfo.playerId)?.attr?.account_id;

    // Preferir el template id (AttrId) almacenado en enemyCache.id. Si no existe, no enviar
    const templateId = this.userDataManager.enemyCache.id ? this.userDataManager.enemyCache.id.get(monsterUuid) : null;
    const monsterId = templateId != null ? templateId : null; // for BPTimer we require template id

        // Obtener hpPct; si no está en la cache, intentar calcularlo con hp y maxHp almacenados
        let hpPct = this.userDataManager.enemyCache.hp_pct.get(monsterUuid);
        if (hpPct == null) {
            const hp = this.userDataManager.enemyCache.hp.get(monsterUuid);
            const maxH = this.userDataManager.enemyCache.maxHp.get(monsterUuid);
            if (hp != null && maxH != null && maxH > 0) {
                hpPct = Math.round((hp / maxH) * 100);
            }
        }
        const position = this.userDataManager.enemyCache.pos.get(monsterUuid);
        const line = this.userDataManager.getUser(localPlayerInfo.playerId).line; // Obtener la línea del jugador local

        this.logger.info(`[BPTimer Debug] Valores para el reporte: templateId=${templateId}, monsterUid=${monsterUid}, monsterId=${monsterId}, hpPct=${hpPct}, line=${line}, position=${JSON.stringify(position)}`);
        // Log types for debugging weird coordinate values
        if (position) {
            try {
                this.logger.debug(`[BPTimer Debug] position types: x=${typeof position.x} y=${typeof position.y} z=${typeof position.z}`);
            } catch (e) {
                this.logger.debug('[BPTimer Debug] position present but failed to read types: ' + e.message);
            }
        }

        // Enviar solo si el templateId está en la lista blanca
        if (!monsterId) {
            this.logger.info(`[BPTimer] No se enviará reporte: templateId no disponible para uuid=${monsterUuid}, instanceUid=${monsterUid}`);
            return;
        }

        if (!ALLOWED_BPTIMER_MOB_IDS.has(Number(monsterId))) {
            this.logger.info(`[BPTimer] Ignorando templateId ${monsterId} (no está en la lista blanca de mobs)`);
            return;
        }

        // Validate position: ensure coordinates are finite and within sane bounds.
        // If coordinates look scaled (very large), attempt to normalize by dividing by powers of 10.
        // If still invalid, drop position but still allow sending the HP report without pos fields.
        let sanePosition = null;
        if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)) {
            const tryNormalize = (pos) => {
                const divs = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e9, 1e12];
                for (const d of divs) {
                    const nx = pos.x / d;
                    const ny = pos.y / d;
                    const nz = pos.z / d;
                    if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz) &&
                        Math.abs(nx) < 1e6 && Math.abs(ny) < 1e6 && Math.abs(nz) < 1e6) {
                        return { x: nx, y: ny, z: nz };
                    }
                }
                return null;
            };
            sanePosition = tryNormalize(position);
        }
        if (!sanePosition) {
            if (position) this.logger.warn(`[BPTimer] Position dropped as invalid or out of bounds: ${JSON.stringify(position)}`);
        }

        if (monsterId && hpPct != null && line != null) {
            const payload = {
                monster_id: monsterId,
                hp_pct: hpPct,
                line: line
            };
            // Only include position for mobs that require it (LOCATION_TRACKED_BPTIMER_MOBS).
            if (sanePosition && LOCATION_TRACKED_BPTIMER_MOBS.has(Number(monsterId))) {
                payload.pos_x = Math.round(sanePosition.x * 100) / 100;
                payload.pos_y = Math.round(sanePosition.y * 100) / 100;
                payload.pos_z = Math.round(sanePosition.z * 100) / 100;
            } else {
                // Either position is invalid or this mob doesn't require position data.
                if (!sanePosition && position) {
                    this.logger.warn(`[BPTimer] Position dropped as invalid or out of bounds: ${JSON.stringify(position)}`);
                }
                this.logger.info('[BPTimer] Enviando reporte sin posición (pos inválida, ausente o no requerida para este mob)');
            }

            if (account_id) {
                payload.account_id = account_id;
            }

            if (localPlayerInfo.playerId) {
                payload.uid = localPlayerInfo.playerId;
            }

            if (!this.bptimerClient) {
                // Cliente no listo: encolar y salir
                this.logger.info(`[BPTimer] Cliente no listo: encolando reporte: ${JSON.stringify(payload)}`);
                // Encolar como {payload, ts}
                this._bptimerQueue.push({ payload, ts: Date.now() });
                // Podar y guardar cola en disco (no bloqueante)
                try {
                    this._pruneBPTimerQueue();
                    this._saveBPTimerQueueToDisk();
                } catch (e) {
                    this.logger.warn('Error al iniciar guardado de cola: ' + e.message);
                }
                return;
            }

            this.logger.info(`[BPTimer] Enviando reporte: ${JSON.stringify(payload)}`);
            try {
                const result = await this.bptimerClient.reportHP(payload);
                if (!result || result.success !== true) {
                    const msg = result && result.message ? result.message : 'Unknown response';
                    const apiErrorDetails = result && result.error ? ` API Error: ${JSON.stringify(result.error)}` : '';
                    this.logger.warn(`[BPTimer] Report failed for monster ${monsterId} at line ${line}: ${msg}${apiErrorDetails} (payload: ${JSON.stringify(payload)})`);
                    // Encolar para reintento en caso de fallo transitorio
                    this._bptimerQueue.push({ payload, ts: Date.now() });
                    this._pruneBPTimerQueue();
                    this._saveBPTimerQueueToDisk();
                } else {
                    this.logger.info(`[BPTimer] Report accepted for monster ${monsterId} at line ${line} with ${hpPct}% HP`);
                }
            } catch (e) {
                const errorDetails = e && e.response && e.response.data ? ` Response Data: ${JSON.stringify(e.response.data)}` : '';
                this.logger.error(`[BPTimer] Error al enviar reporte para monster ${monsterId}: ${e && e.message ? e.message : e}${errorDetails}`);
                // Encolar para reintento
                this._bptimerQueue.push({ payload, ts: Date.now() });
                try { this._pruneBPTimerQueue(); this._saveBPTimerQueueToDisk(); } catch (_) {}
            }
        } else {
            this.logger.warn(`[BPTimer] No se pudo enviar el reporte. Datos incompletos: monsterId=${monsterId}, hpPct=${hpPct}, position=${JSON.stringify(position)}, line=${line}`);
        }
    }

    /**
     * Actualiza el estado de habilitación/deshabilitación del envío a BPTimer.
     * @param {boolean} enabled - true para habilitar, false para deshabilitar.
     */
    setBptimerEnabled(enabled) {
        this.bptimerEnabled = enabled;
        this.logger.info(`[BPTimer] Envío a BPTimer actualizado a: ${enabled ? 'habilitado' : 'deshabilitado'}`);
    }

    _processNotifyMsg(reader, isZstdCompressed) {
        const serviceUuid = reader.readUInt64();
        const stubId = reader.readUInt32();
        const methodId = reader.readUInt32();

        if (serviceUuid !== 0x0000000063335342n) {
            this.logger.debug(`Skipping NotifyMsg with serviceId ${serviceUuid}`);
            return;
        }

        let msgPayload = reader.readRemaining();
        if (isZstdCompressed) {
            msgPayload = this._decompressPayload(msgPayload);
        }

        switch (methodId) {
            case NotifyMethod.SyncNearEntities:
                this._processSyncNearEntities(msgPayload);
                break;
            case NotifyMethod.SyncContainerData:
                this._processSyncContainerData(msgPayload);
                break;
            case NotifyMethod.SyncContainerDirtyData:
                this._processSyncContainerDirtyData(msgPayload);
                break;
            case NotifyMethod.SyncToMeDeltaInfo:
                this._processSyncToMeDeltaInfo(msgPayload);
                break;
            case NotifyMethod.SyncNearDeltaInfo:
                this._processSyncNearDeltaInfo(msgPayload);
                break;
            default:
                this.logger.debug(`Skipping NotifyMsg with methodId ${methodId}`);
                break;
        }
        return;
    }

    _processReturnMsg(reader, isZstdCompressed) {
        this.logger.debug(`Unimplemented processing return`);
    }

    processPacket(packets) {
        try {
            const packetsReader = new BinaryReader(packets);

            do {
                let packetSize = packetsReader.peekUInt32();
                if (packetSize < 6) {
                    this.logger.debug(`Received invalid packet`);
                    return;
                }

                const packetReader = new BinaryReader(packetsReader.readBytes(packetSize));
                packetSize = packetReader.readUInt32(); // to advance
                const packetType = packetReader.readUInt16();
                const isZstdCompressed = packetType & 0x8000;
                const msgTypeId = packetType & 0x7fff;

                switch (msgTypeId) {
                    case MessageType.Notify:
                        this._processNotifyMsg(packetReader, isZstdCompressed);
                        break;
                    case MessageType.Return:
                        this._processReturnMsg(packetReader, isZstdCompressed);
                        break;
                    case MessageType.FrameDown:
                        const serverSequenceId = packetReader.readUInt32();
                        if (packetReader.remaining() == 0) break;

                        let nestedPacket = packetReader.readRemaining();

                        if (isZstdCompressed) {
                            nestedPacket = this._decompressPayload(nestedPacket);
                        }

                        // this.logger.debug("Processing FrameDown packet.");
                        this.processPacket(nestedPacket);
                        break;
                    default:
                        // this.logger.debug(`Ignore packet with message type ${msgTypeId}.`);
                        break;
                }
            } while (packetsReader.remaining() > 0);
        } catch (e) {
            const playerIdentifier = this.localPlayerTracker.playerId ? this.localPlayerTracker.playerId.toString() : 'Unknown';
            this.logger.error(`Fail while parsing data for player ${playerIdentifier}.\nErr: ${e}`);
        }
    }
}

module.exports = PacketProcessor;
