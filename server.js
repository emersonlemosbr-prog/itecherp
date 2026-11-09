/**
 * Entrypoint principal para implantação em plataformas PaaS (ShardCloud / Render / Railway).
 * Encaminha a execução para backend/server.js mantendo compatibilidade total de ambiente.
 */
const path = require('path');

// Carrega .env da raiz caso exista (para ambientes locais ou configs centralizadas)
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) {}

// Ajusta o diretório de trabalho do processo para backend/ para compatibilidade total
const backendDir = path.join(__dirname, 'backend');
try {
  process.chdir(backendDir);
} catch (err) {
  console.error('[ENTRYPOINT] Falha ao alternar diretório de trabalho para backend:', err.message);
}

// Executa o servidor original do backend
module.exports = require(path.join(backendDir, 'server.js'));

