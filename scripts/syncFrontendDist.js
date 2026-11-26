const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'frontend', 'dist');
const publicDir = path.join(rootDir, 'backend', 'public');
const distAssetsDir = path.join(distDir, 'assets');
const publicAssetsDir = path.join(publicDir, 'assets');

if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('[SYNC_FRONTEND] frontend/dist/index.html não encontrado. Execute o build do frontend primeiro.');
  process.exit(1);
}

fs.mkdirSync(publicDir, { recursive: true });
fs.copyFileSync(path.join(distDir, 'index.html'), path.join(publicDir, 'index.html'));

if (fs.existsSync(distAssetsDir)) {
  const newAssets = new Set(fs.readdirSync(distAssetsDir));
  fs.mkdirSync(publicAssetsDir, { recursive: true });

  for (const existing of fs.readdirSync(publicAssetsDir)) {
    if (!newAssets.has(existing)) {
      fs.rmSync(path.join(publicAssetsDir, existing), { recursive: true, force: true });
    }
  }

  fs.cpSync(distAssetsDir, publicAssetsDir, { recursive: true, force: true });
}

console.log('[SYNC_FRONTEND] frontend/dist sincronizado com backend/public com sucesso.');
