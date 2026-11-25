
/**
 * Entrypoint principal para implantação em plataformas PaaS (ShardCloud / Render / Railway).
 * Encaminha a execução para backend/server.js mantendo compatibilidade total de ambiente.
 */
const path = require('path');

// Carrega .env da raiz caso exista
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) { }

// Ajusta o diretório de trabalho para backend/
const backendDir = path.join(__dirname, 'backend');

try {
  process.chdir(backendDir);
} catch (err) {
  console.error('[ENTRYPOINT] Falha ao alternar diretório de trabalho para backend:', err.message);
}

// Carrega o backend e inicia explicitamente o servidor.
const backend = require(path.join(backendDir, 'server.js'));
backend.startServer();
