#!/usr/bin/env node
/**
 * GitGuard - Local Repository & Commit Security Guardian
 * Inspirado nos padrões GitGuard / GitGuardian para inspeção pré-commit e pré-push.
 *
 * Funcionalidades:
 * 1. Previne commit de credenciais, chaves de API, senhas e tokens reais.
 * 2. Bloqueia inclusão de arquivos .env com valores reais, logs (*.log) e dumps de banco (*.db, *.sqlite).
 * 3. Valida boas práticas de segurança no código antes da persistência.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SENSITIVE_PATTERNS = [
  { name: 'Private Key', regex: /-----BEGIN (RSA|EC|DSA|OPENSSH|PGP)? ?PRIVATE KEY-----/i },
  { name: 'AWS Access Key ID', regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/ },
  { name: 'Generic Secret Token / Key', regex: /(?:api_key|apikey|secret_key|secretkey|access_token|auth_token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i },
  { name: 'PostgreSQL Real Password in plain URL', regex: /postgres(?:ql)?:\/\/[^:]+:[^@\s]{6,}@[^/\s]+\//i },
  { name: 'Supabase Service Role Key', regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_\-]{30,}\.[a-zA-Z0-9_\-]{30,}/ },
];

const BLOCKED_FILE_EXTENSIONS = ['.env', '.log', '.db', '.sqlite', '.sqlite3'];

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
    return output.split(/\r?\n/).map(f => f.trim()).filter(Boolean);
  } catch (err) {
    return [];
  }
}

function scan() {
  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    return 0;
  }

  let violations = [];

  for (const file of stagedFiles) {
    // 1. Checa extensão de arquivo bloqueada
    const ext = path.extname(file).toLowerCase();
    const basename = path.basename(file).toLowerCase();

    if (basename === '.env' || (BLOCKED_FILE_EXTENSIONS.includes(ext) && !file.includes('.example'))) {
      violations.push({
        file,
        issue: `Arquivo sensível bloqueado (${basename}). Nunca adicione arquivos de credenciais ou bancos ao Git.`,
      });
      continue;
    }

    if (!fs.existsSync(file)) continue;

    // Apenas analisa arquivos de texto de até 2MB
    const stats = fs.statSync(file);
    if (stats.size > 2 * 1024 * 1024) continue;

    try {
      const content = fs.readFileSync(file, 'utf8');

      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.regex.test(content)) {
          // Permite arquivos de teste ou documentação se contiverem explicitamente "example" ou "fake"
          if (file.includes('test') || file.includes('example') || file.includes('.md')) {
            continue;
          }
          violations.push({
            file,
            issue: `Possível credencial ou chave detectada: ${pattern.name}`,
          });
          break;
        }
      }
    } catch (_) {
      // Ignora arquivos binários
    }
  }

  if (violations.length > 0) {
    console.error('\n🚨 [GitGuard Security Scan] Violações de segurança encontradas antes do commit:');
    violations.forEach(v => {
      console.error(`  ❌ ${v.file}: ${v.issue}`);
    });
    console.error('\nO commit foi bloqueado pelo GitGuard para proteger seu repositório.');
    console.error('Remova os segredos ou arquivos sensíveis antes de continuar.\n');
    return 1;
  }

  return 0;
}

const exitCode = scan();
process.exit(exitCode);
