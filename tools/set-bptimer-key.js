#!/usr/bin/env node
// Tool para guardar la BPTimer API Key en el almacén seguro del sistema usando keytar.
// Uso:
//   node tools/set-bptimer-key.js <API_KEY>
// o
//   BPTIMER_API_KEY=... node tools/set-bptimer-key.js

(async () => {
  const key = process.argv[2] || process.env.BPTIMER_API_KEY;
  if (!key) {
    console.error('Uso: node tools/set-bptimer-key.js <API_KEY>  (o exportar BPTIMER_API_KEY)');
    process.exit(1);
  }

  try {
    const keytar = require('keytar');
    await keytar.setPassword('bpsr-meter', 'bptimer_api_key', key);
    console.log('BPTimer API key almacenada en el almacén seguro del sistema.');
    process.exit(0);
  } catch (e) {
    console.error('No se pudo guardar la API key. Asegúrate de tener el módulo "keytar" instalado y que tu plataforma lo soporte.');
    console.error(e.message || e);
    process.exit(2);
  }
})();
