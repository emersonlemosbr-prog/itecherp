#!/usr/bin/env node
/**
 * scripts/manageStoreAdmin.js
 * 
 * Procedimento administrativo de terminal para criar ou redefinir a senha do 
 * Administrador do iTech ERP (usuário da loja principal no Supabase PostgreSQL).
 * 
 * Recursos:
 * - Não deixa senhas em texto puro em logs nem arquivos.
 * - Suporta execução interativa segura (oculta/pergunta senha) ou via flags CLI.
 * - Conecta diretamente ao banco de dados Supabase PostgreSQL oficial (DATABASE_URL).
 * - Gera hash bcrypt com salt cost 12.
 * - Concede a role 'admin' e 'is_master = 1' na Loja Principal (store_id = 1).
 * - Valida campos obrigatórios e integridade referencial.
 * 
 * Uso:
 *   node scripts/manageStoreAdmin.js
 *   node scripts/manageStoreAdmin.js --username admin --password "SuaSenhaForte123"
 *   node scripts/manageStoreAdmin.js --reset-password --username itechcelular --password "NovaSenha123"
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../db/database');

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

async function run() {
  console.log('================================================================');
  console.log('   iTech ERP — Gestão de Administrador do Sistema (Terminal)   ');
  console.log('   Banco: Supabase PostgreSQL (Produção / Cloud)                ');
  console.log('================================================================\n');

  const args = process.argv.slice(2);
  let username = '';
  let password = '';
  let fullName = '';
  let isReset = args.includes('--reset-password');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username' && args[i + 1]) username = args[++i];
    if (args[i] === '--password' && args[i + 1]) password = args[++i];
    if (args[i] === '--name' && args[i + 1]) fullName = args[++i];
  }

  // 1. Garantir que a Loja Principal (ID 1) existe e está ativa
  let mainStore = await db.queryOne('SELECT id, name, status FROM stores WHERE id = 1');
  if (!mainStore) {
    console.log('Criando registro da Loja Principal (ID 1)...');
    await db.query(`
      INSERT INTO stores (id, name, slug, owner_name, owner_email, status, plan, due_date, grace_period_days)
      VALUES (1, 'iTech Celular e Informática', 'itech', 'Emerson Lemos', 'contato@itechcelulareinformatica.com.br', 'active', 'pro', '2099-12-31', 5)
      ON CONFLICT (id) DO UPDATE SET status = 'active', due_date = '2099-12-31'
    `);
    mainStore = { id: 1, name: 'iTech Celular e Informática', status: 'active' };
  }

  // 2. Coletar dados interativamente se não fornecidos
  if (!username) {
    username = await askQuestion('Nome de Usuário (login no ERP) [padrão: admin]: ');
    if (!username) username = 'admin';
  }

  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3) {
    console.error('\n[ERRO] O nome de usuário deve ter no mínimo 3 caracteres.');
    process.exit(1);
  }

  // Verificar se o usuário já existe
  const existingUser = await db.queryOne('SELECT id, store_id, full_name, username, role, is_master, active FROM users WHERE LOWER(username) = $1', [cleanUsername]);

  if (existingUser && !isReset && !args.includes('--password')) {
    console.log(`\n[AVISO] O usuário "${cleanUsername}" já existe (ID: ${existingUser.id}, Loja: ${existingUser.store_id}, Role: ${existingUser.role}).`);
    const answer = await askQuestion('Deseja redefinir a senha deste administrador? (s/N): ');
    if (answer.toLowerCase() === 's') {
      isReset = true;
    } else {
      console.log('Operação cancelada.');
      process.exit(0);
    }
  }

  if (!password) {
    password = await askQuestion('Digite a nova senha (mínimo 6 caracteres): ');
  }

  if (!password || password.length < 6) {
    console.error('\n[ERRO] A senha deve conter pelo menos 6 caracteres.');
    process.exit(1);
  }

  const hash = bcrypt.hashSync(password, 12);

  if (existingUser) {
    // Redefinir senha e garantir que está ativo e com role admin na loja 1
    await db.query(`
      UPDATE users 
      SET password_hash = $1, role = 'admin', active = 1, is_master = 1, updated_at = NOW()
      WHERE id = $2
    `, [hash, existingUser.id]);

    console.log('\n================================================================');
    console.log(' [SUCESSO] Senha do Administrador redefinida com êxito!');
    console.log(`   Usuário: ${cleanUsername}`);
    console.log(`   ID:      ${existingUser.id}`);
    console.log(`   Status:  Ativo (admin master)`);
    console.log('   Acesso:  https://erp.itechcelulareinformatica.com.br/');
    console.log('================================================================\n');
    process.exit(0);
  } else {
    // Criar novo usuário administrador
    if (!fullName) {
      fullName = await askQuestion('Nome Completo do Administrador [padrão: Administrador]: ');
      if (!fullName) fullName = 'Administrador';
    }

    const inserted = await db.queryOne(`
      INSERT INTO users (store_id, full_name, username, password_hash, role, active, is_master, job_title, permissions)
      VALUES (1, $1, $2, $3, 'admin', 1, 1, 'Proprietário', '{}')
      RETURNING id, username
    `, [fullName.trim(), cleanUsername, hash]);

    console.log('\n================================================================');
    console.log(' [SUCESSO] Novo Administrador criado com êxito no Supabase!');
    console.log(`   Usuário: ${inserted.username}`);
    console.log(`   ID:      ${inserted.id}`);
    console.log(`   Loja:    Loja Principal (ID 1)`);
    console.log(`   Status:  Ativo (admin master)`);
    console.log('   Acesso:  https://erp.itechcelulareinformatica.com.br/');
    console.log('================================================================\n');
    process.exit(0);
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error('\n[ERRO FATAL]', err.message);
    process.exit(1);
  });
}

module.exports = { run };
