#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distElectronPath = path.join(__dirname, '../dist_electron');
const asarPath = path.join(distElectronPath, 'win-unpacked/resources/app.asar');

console.log('[BUILD-FIX] Iniciando limpieza agresiva de dist_electron...');

function forceRemoveDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`[BUILD-FIX] Directorio no existe: ${dirPath}`);
    return;
  }

  try {
    // Intentar primero con rmdir recursivo
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`[BUILD-FIX] ✓ Directorio eliminado: ${dirPath}`);
  } catch (error) {
    console.error(`[BUILD-FIX] Error eliminando ${dirPath}:`, error.message);
    
    // Intentar con comando del sistema
    try {
      if (process.platform === 'win32') {
        execSync(`cmd /c "rmdir /s /q "${dirPath}"" 2>nul`, { 
          timeout: 10000 
        });
        console.log(`[BUILD-FIX] ✓ Directorio eliminado con CMD: ${dirPath}`);
      }
    } catch (cmdError) {
      console.error(`[BUILD-FIX] Error con CMD:`, cmdError.message);
    }
  }
}

console.log('[BUILD-FIX] Eliminando dist_electron completo...');
forceRemoveDir(distElectronPath);

// Esperar un poco
console.log('[BUILD-FIX] Esperando 3 segundos...');
setTimeout(() => {
  console.log('[BUILD-FIX] Verificando estado...');
  if (fs.existsSync(distElectronPath)) {
    console.error('[BUILD-FIX] ✗ dist_electron aún existe!');
    process.exit(1);
  } else {
    console.log('[BUILD-FIX] ✓ dist_electron eliminado exitosamente');
    console.log('[BUILD-FIX] Ejecutando build...');
    
    try {
      execSync('pnpm run dist', { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        timeout: 600000
      });
      console.log('[BUILD-FIX] ✓ Build completado exitosamente');
    } catch (error) {
      console.error('[BUILD-FIX] ✗ Error durante el build:', error.message);
      process.exit(1);
    }
  }
}, 3000);
