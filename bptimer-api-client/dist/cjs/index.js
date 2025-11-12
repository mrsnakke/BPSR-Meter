"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BPTimerClient = void 0;
const constants_js_1 = require("./constants.js");
__exportStar(require("./constants.js"), exports);
__exportStar(require("./types.js"), exports);
class BPTimerClient {
    constructor(config) {
        this.cache = new Map();
        this.api_url = config.api_url;
        this.api_key = config.api_key;
        this.enabled = config.enabled ?? true;
        this.log_level = config.log_level ?? 'info';
        this.logger = config.logger || {
            info: (message) => console.log('[INFO]', message),
            debug: (message) => console.log('[DEBUG]', message)
        };
    }
    log(level, message) {
        if (this.log_level === 'silent')
            return;
        if (level === 'debug' && this.log_level !== 'debug')
            return;
        this.logger[level](`[BPTimer] ${message}`);
    }
    async reportHP(params) {
        const { monster_id, hp_pct, line, pos_x, pos_y, pos_z, region } = params;
        const rounded_pos_x = pos_x !== undefined ? Math.round(pos_x * 100) / 100 : undefined;
        const rounded_pos_y = pos_y !== undefined ? Math.round(pos_y * 100) / 100 : undefined;
        const rounded_pos_z = pos_z !== undefined ? Math.round(pos_z * 100) / 100 : undefined;
        if (!this.enabled) {
            this.log('debug', 'Client is disabled');
            return { success: false, message: 'Client is disabled' };
        }
        if (!this.api_key || !this.api_url) {
            this.log('debug', 'API key or URL not configured');
            return { success: false, message: 'API key or URL not configured' };
        }
        if ((pos_x !== undefined && (pos_y === undefined || pos_z === undefined)) ||
            (pos_y !== undefined && (pos_x === undefined || pos_z === undefined)) ||
            (pos_z !== undefined && (pos_x === undefined || pos_y === undefined))) {
            return {
                success: false,
                message: 'pos_x, pos_y, and pos_z must all be provided together or all omitted'
            };
        }
        const monster_key = String(monster_id);
        if (!constants_js_1.MOB_MAPPING.has(monster_key)) {
            this.log('debug', `Monster ${monster_key} not tracked`);
            return { success: false, message: 'Monster ID not tracked' };
        }
        // Check if this mob requires position data
        if (constants_js_1.LOCATION_TRACKED_MOBS.has(Number(monster_id)) &&
            (pos_x === undefined || pos_y === undefined || pos_z === undefined)) {
            this.log('debug', `Monster ${monster_key} requires position data`);
            return {
                success: false,
                message: 'Position data (pos_x, pos_y, pos_z) required for this mob'
            };
        }
        // Round to nearest HP_REPORT_INTERVAL
        const current_hp = Math.round(hp_pct / constants_js_1.HP_REPORT_INTERVAL) * constants_js_1.HP_REPORT_INTERVAL;
        const cache_key = `${monster_key}-${line}`;
        let entry = this.cache.get(cache_key);
        const now = Date.now();
        // Create new entry if missing or expired
        if (!entry || now - entry.timestamp > constants_js_1.CACHE_EXPIRY_MS) {
            if (entry) {
                this.log('debug', `Expired cache for ${monster_key}-${line}`);
            }
            entry = {
                timestamp: now,
                last_reported_hp: null,
                is_pending: false
            };
            this.cache.set(cache_key, entry);
        }
        // Skip if we already reported this HP value
        if (entry.last_reported_hp === current_hp) {
            this.log('debug', `Already reported ${current_hp}% HP for ${monster_key}-${line} (cache hit)`);
            return { success: false, message: 'Already reported this HP' };
        }
        // Skip if a request is already in progress
        if (entry.is_pending) {
            this.log('debug', `Request already pending for ${monster_key}-${line}-${current_hp}`);
            return { success: false, message: 'Report in progress' };
        }
        entry.is_pending = true;
        try {
            const payload = {
                monster_id: Number(monster_id),
                hp_pct: current_hp,
                line,
                ...(rounded_pos_x !== undefined && { pos_x: rounded_pos_x }),
                ...(rounded_pos_y !== undefined && { pos_y: rounded_pos_y }),
                ...(rounded_pos_z !== undefined && { pos_z: rounded_pos_z }),
                ...(region && { region })
            };
            const response = await fetch(`${this.api_url}/api/create-hp-report`, {
                method: 'POST',
                headers: {
                    'X-API-Key': this.api_key,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const error_data = (await response.json().catch(() => ({})));
                const error_message = error_data.message || `API error: ${response.status}`;
                this.log('info', `Failed to report HP: ${error_message}`);
                entry.last_reported_hp = current_hp; // prevent spamming retries
                return { success: false, message: error_message };
            }
            const data = (await response.json().catch(() => ({})));
            entry.last_reported_hp = current_hp;
            const monster_name = constants_js_1.MOB_MAPPING.get(monster_key) || monster_key;
            const pos_info = rounded_pos_x !== undefined && rounded_pos_y !== undefined && rounded_pos_z !== undefined
                ? ` X: ${rounded_pos_x}, Y: ${rounded_pos_y}, Z: ${rounded_pos_z}`
                : '';
            this.log('info', `Reported ${current_hp}% HP for ${monster_name} (${monster_key}) on Line ${line}${pos_info}`);
            return { success: true, data };
        }
        catch (error) {
            const error_message = error instanceof Error ? error.message : 'Unknown error';
            this.log('info', `Failed to report HP: ${error_message}`);
            entry.last_reported_hp = current_hp; // prevent spamming retries
            return {
                success: false,
                message: error_message
            };
        }
        finally {
            entry.is_pending = false;
        }
    }
    resetMonster(monster_id, line) {
        const monster_key = String(monster_id);
        if (line !== undefined) {
            this.cache.delete(`${monster_key}-${line}`);
        }
        else {
            const prefix = `${monster_key}-`;
            for (const key of this.cache.keys()) {
                if (key.startsWith(prefix)) {
                    this.cache.delete(key);
                }
            }
        }
    }
    clearAll() {
        this.cache.clear();
    }
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    isEnabled() {
        return this.enabled;
    }
    async testConnection() {
        this.log('debug', 'Testing API endpoint...');
        try {
            const response = await fetch(`${this.api_url}/api/health`, {
                method: 'GET',
                headers: {
                    'X-API-Key': this.api_key
                }
            });
            if (!response.ok) {
                const error_message = `API endpoint returned ${response.status}`;
                this.log('info', `API test failed: ${error_message}`);
                return { success: false, message: error_message };
            }
            this.log('info', 'API endpoint responding, key validated');
            return { success: true };
        }
        catch (error) {
            const error_message = error instanceof Error ? error.message : 'Unknown error';
            this.log('info', `API test failed: ${error_message}`);
            return { success: false, message: error_message };
        }
    }
}
exports.BPTimerClient = BPTimerClient;
//# sourceMappingURL=index.js.map