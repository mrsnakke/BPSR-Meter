#!/usr/bin/env node
// Script para preparar la API key para el empaquetado (inyecta desde .env al bundle sin subirla a GitHub)
// Uso: node tools/prepare-dist.js

const fs = require('fs');
const path = require('path');

// Leer .env sin dependencias externas
let API_KEY = process.env.BPTIMER_API_KEY;
let API_URL = process.env.BPTIMER_API_URL || 'https://db.bptimer.com';

// Si no están en env, intentar leer desde .env file
if (!API_KEY) {
  const envPath = path.join(__dirname, '..', '.env');
  try {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const lines = envContent.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [key, ...valueParts] = trimmed.split('=');
        if (key.trim() === 'BPTIMER_API_KEY') {
          API_KEY = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        }
        if (key.trim() === 'BPTIMER_API_URL') {
          API_URL = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

if (!API_KEY) {
  console.error('ERROR: BPTIMER_API_KEY no está definida en .env');
  console.error('Por favor, crea un archivo .env con BPTIMER_API_KEY=tu_clave_aqui');
  process.exit(1);
}

// Crear archivo de configuración en el directorio public (será incluido automáticamente)
const configContent = `
// GENERADO AUTOMÁTICAMENTE - NO EDITAR MANUALMENTE
// Este archivo se genera en tiempo de build a partir de .env (no está en el repo)
module.exports = {
  BPTIMER_API_KEY: '${API_KEY}',
  BPTIMER_API_URL: '${API_URL}'
};
`;

const configPath = path.join(__dirname, '..', 'public', 'build-config.js');
fs.writeFileSync(configPath, configContent, 'utf8');
console.log('[INFO] Configuración de API key inyectada en public/build-config.js para empaquetado.');
console.log(`[INFO] API URL: ${API_URL}`);
