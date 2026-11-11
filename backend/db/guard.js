// backend/db/guard.js
// Guardião de Segurança Central: Impede qualquer execução de testes contra o banco de produção.

const fs = require('fs');
const path = require('path');

// Padrões conhecidos e proibidos que caracterizam o ambiente de produção
const FORBIDDEN_PRODUCTION_PATTERNS = [
  'supabase.co',
  'supabase.com',
  'pooler.supabase.com',
  'render.com',
  'shardcloud',
  'itechcelular',
  'aws-0-',
];

/**
 * Lê o arquivo .env de produção (se existir) para extrair as URLs de produção conhecidas
 * para bloqueio exato por comparação de string/hash.
 */
function getKnownProductionUrls() {
  const prodUrls = new Set();
  try {
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('DATABASE_URL=') || trimmed.startsWith('POSTGRES_URL=')) {
          const val = trimmed.split('=')[1]?.replace(/^["']|["']$/g, '').trim();
          if (val) prodUrls.add(val.toLowerCase());
        }
      }
    }
  } catch (_) {}
  return prodUrls;
}

/**
 * Verifica se uma URL de banco aponta para o ambiente de produção.
 */
function isProductionDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const lower = rawUrl.toLowerCase();

  // 1. Verifica contra as URLs literais cadastradas no .env de produção
  const knownProd = getKnownProductionUrls();
  for (const prodUrl of knownProd) {
    if (lower === prodUrl) return true;
  }

  // 2. Verifica se contém padrões conhecidos de infraestrutura de nuvem/produção
  for (const pattern of FORBIDDEN_PRODUCTION_PATTERNS) {
    if (lower.includes(pattern)) return true;
  }

  return false;
}

/**
 * Verifica se a URL é autorizada para testes.
 * Apenas bancos locais (localhost, 127.0.0.1) ou explicitamente com sufixo/nome '_test'
 * que NÃO contenham credenciais ou domínios de produção são autorizados.
 */
function isAuthorizedTestDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  if (isProductionDatabaseUrl(rawUrl)) return false;

  const lower = rawUrl.toLowerCase();
  const isLocal = lower.includes('localhost') || lower.includes('127.0.0.1');
  const isTestDbName = lower.includes('_test') || lower.includes('test_') || lower.includes('/test');

  return isLocal || isTestDbName;
}

/**
 * Validador estrito invocado na inicialização de testes.
 * Lança erro ou encerra o processo caso detecte risco de conexão a produção.
 */
function assertSafeTestEnvironment({ url, isTestProcess = false } = {}) {
  const isTest = isTestProcess || process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test'));
  
  if (!isTest) {
    return { safe: true, mode: 'production_or_dev' };
  }

  const targetUrl = url || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;

  // Se o teste está rodando e a URL aponta para produção: BLOQUEIO IMEDIATO
  if (targetUrl && isProductionDatabaseUrl(targetUrl)) {
    const errorMsg = 'EXECUÇÃO BLOQUEADA: testes automatizados não podem utilizar o banco de dados de produção do iTech ERP.';
    console.error(`\n🛑 [SECURITY CRITICAL] ${errorMsg}`);
    console.error(`URL detectada como produção: ${targetUrl.replace(/:[^:@]+@/, ':****@')}\n`);
    throw new Error(errorMsg);
  }

  // Se houver uma URL fornecida para testes, ela deve ser explicitamente autorizada
  if (targetUrl && !isAuthorizedTestDatabaseUrl(targetUrl)) {
    const errorMsg = 'EXECUÇÃO BLOQUEADA: A URL de banco de dados fornecida não foi reconhecida como um ambiente de teste isolado e autorizado.';
    console.error(`\n🛑 [SECURITY CRITICAL] ${errorMsg}\n`);
    throw new Error(errorMsg);
  }

  return {
    safe: true,
    mode: 'test_isolated',
    targetUrl: targetUrl || 'sqlite_in_memory_or_temp',
  };
}

module.exports = {
  isProductionDatabaseUrl,
  isAuthorizedTestDatabaseUrl,
  assertSafeTestEnvironment,
  FORBIDDEN_PRODUCTION_PATTERNS,
};
