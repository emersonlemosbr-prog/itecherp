// scripts/createPlatformAdmin.js
// Cria a primeira conta de Administrador da Plataforma (Superadmin)
// sem credenciais embutidas no código ou repositório.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../db/database');

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

async function run() {
  console.log('========================================================');
  console.log('   Criação de Administrador da Plataforma iTech ERP     ');
  console.log('========================================================');

  // Verificar se já existe algum superadmin
  const countRow = await db.prepare('SELECT COUNT(*) as count FROM platform_users').get();
  const existingCount = parseInt(countRow?.count || '0', 10);
  if (existingCount > 0) {
    console.log(`\n[AVISO] Já existem ${existingCount} administrador(es) da plataforma cadastrado(s).`);
    const proceed = await askQuestion('Deseja criar um administrador adicional da plataforma via CLI? (s/N): ');
    if (proceed.toLowerCase() !== 's') {
      console.log('Operação cancelada.');
      process.exit(0);
    }
  }

  // Obter argumentos via CLI ou interativamente
  const args = process.argv.slice(2);
  let name = '';
  let email = '';
  let password = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) name = args[++i];
    if (args[i] === '--email' && args[i + 1]) email = args[++i];
    if (args[i] === '--password' && args[i + 1]) password = args[++i];
  }

  if (!name) {
    name = await askQuestion('Nome do Administrador da Plataforma: ');
  }
  if (!email) {
    email = await askQuestion('E-mail do Administrador da Plataforma: ');
  }
  if (!password) {
    password = await askQuestion('Senha do Administrador (mínimo 8 caracteres): ');
  }

  if (!name || name.trim().length < 2) {
    console.error('\n[ERRO] Nome inválido.');
    process.exit(1);
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    console.error('\n[ERRO] E-mail inválido.');
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error('\n[ERRO] A senha deve conter pelo menos 8 caracteres.');
    process.exit(1);
  }

  const existingEmail = await db.prepare('SELECT id FROM platform_users WHERE email = ?').get(cleanEmail);
  if (existingEmail) {
    console.error(`\n[ERRO] Já existe um administrador com o e-mail: ${cleanEmail}`);
    process.exit(1);
  }

  const passwordHash = bcrypt.hashSync(password, 12);

  const insert = await db.prepare(`
    INSERT INTO platform_users (name, email, password_hash, role, active)
    VALUES (?, ?, ?, 'superadmin', 1)
  `).run(name.trim(), cleanEmail, passwordHash);

  console.log('\n========================================================');
  console.log(' [SUCESSO] Administrador da Plataforma criado com êxito!');
  console.log(` ID: ${insert.lastInsertRowid}`);
  console.log(` Nome: ${name.trim()}`);
  console.log(` E-mail: ${cleanEmail}`);
  console.log(' Painel de Acesso: /admin-plataforma');
  console.log('========================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('\n[ERRO]', err.message);
  process.exit(1);
});
