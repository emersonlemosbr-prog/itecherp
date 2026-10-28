#!/usr/bin/env node
/**
 * iTech ERP - Script Seguro de Inicialização do PostgreSQL (Supabase / Render)
 * 
 * Executa o DDL de esquema novo e vazio no banco PostgreSQL
 * e cria com segurança o primeiro Administrador e Loja inicial.
 * 
 * Uso:
 *   node backend/scripts/bootstrapPostgres.js
 * 
 * Variáveis de ambiente opcionais:
 *   DATABASE_URL                   - URL de conexão PostgreSQL/Supabase
 *   INITIAL_SUPERADMIN_EMAIL       - E-mail do Superadmin da Plataforma
 *   INITIAL_SUPERADMIN_PASSWORD    - Senha do Superadmin (se omitida, é gerada aleatoriamente)
 *   INITIAL_STORE_ADMIN_USER       - Nome de usuário do Administrador da Loja
 *   INITIAL_STORE_ADMIN_PASSWORD   - Senha do Administrador da Loja (se omitida, é gerada aleatoriamente)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const crypto = require('crypto');
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../db/database');

function generateSecurePassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  let password = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

function ask(question, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const promptText = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function runBootstrap() {
  console.log('================================================================');
  console.log('   iTech ERP - Inicialização Segura do PostgreSQL na Nuvem      ');
  console.log('================================================================\n');

  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.error('❌ ERRO: A variável de ambiente DATABASE_URL não está definida.');
    console.error('Configure a URL de conexão do Supabase ou PostgreSQL no arquivo .env ou no terminal.');
    console.error('Exemplo: DATABASE_URL=postgresql://postgres.xxx:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres\n');
    process.exit(1);
  }

  try {
    // 1. Inicializar esquema DDL
    console.log('🔨 [1/4] Executando criação de tabelas, índices e triggers...');
    await db.initSchema();

    // 2. Criar ou verificar Superadmin da Plataforma
    console.log('\n👤 [2/4] Verificando Administrador da Plataforma (Superadmin)...');
    const existingPlatformAdmin = await db.queryOne('SELECT id, email FROM platform_users WHERE role = $1 LIMIT 1', ['superadmin']);

    let superAdminCredentials = null;
    if (existingPlatformAdmin) {
      console.log(`ℹ️ Superadmin já cadastrado: ${existingPlatformAdmin.email}`);
    } else {
      const email = process.env.INITIAL_SUPERADMIN_EMAIL || (process.stdin.isTTY ? await ask('E-mail do Superadmin da Plataforma', 'admin@itechcelulareinformatica.com.br') : 'admin@itechcelulareinformatica.com.br');
      let password = process.env.INITIAL_SUPERADMIN_PASSWORD;
      let generated = false;

      if (!password) {
        if (process.stdin.isTTY) {
          const inputPwd = await ask('Senha do Superadmin (pressione Enter para gerar segura)');
          if (inputPwd && inputPwd.length >= 8) {
            password = inputPwd;
          }
        }
        if (!password) {
          password = generateSecurePassword(16);
          generated = true;
        }
      }

      const hash = bcrypt.hashSync(password, 10);
      await db.query(
        'INSERT INTO platform_users (name, email, password_hash, role, active, session_version) VALUES ($1, $2, $3, $4, 1, 1)',
        ['Superadmin iTech', email.toLowerCase(), hash, 'superadmin']
      );

      superAdminCredentials = { email, password, generated };
      console.log('✅ Superadmin da plataforma criado com sucesso!');
    }

    // 3. Criar ou verificar Loja Principal
    console.log('\n🏬 [3/4] Verificando Loja Principal (Tenant)...');
    let mainStore = await db.queryOne('SELECT id, name, slug FROM stores WHERE id = 1');

    if (!mainStore) {
      const storeName = process.env.INITIAL_STORE_NAME || 'iTech Celular e Informática';
      const storeSlug = process.env.INITIAL_STORE_SLUG || 'itech';
      const ownerEmail = process.env.INITIAL_OWNER_EMAIL || 'contato@itechcelulareinformatica.com.br';
      const ownerName = process.env.INITIAL_OWNER_NAME || 'Emerson Lemos';

      await db.query(`
        INSERT INTO stores (id, name, slug, owner_name, owner_email, status, plan, due_date, grace_period_days)
        VALUES (1, $1, $2, $3, $4, 'active', 'pro', '2099-12-31', 5)
      `, [storeName, storeSlug, ownerName, ownerEmail]);

      await db.query(`
        INSERT INTO store_subscription_history (store_id, action, new_status, new_due_date, notes, performed_by_name)
        VALUES (1, 'initial_bootstrap', 'active', '2099-12-31', 'Inicialização do banco em nuvem', 'Bootstrap Script')
      `);

      mainStore = { id: 1, name: storeName, slug: storeSlug };
      console.log(`✅ Loja principal criada: "${storeName}" (ID 1, slug: ${storeSlug})`);
    } else {
      console.log(`ℹ️ Loja principal já existente: "${mainStore.name}" (ID 1)`);
    }

    // 4. Criar ou verificar Administrador Master da Loja
    console.log('\n🔑 [4/4] Verificando Usuário Administrador da Loja...');
    const existingStoreAdmin = await db.queryOne('SELECT id, username FROM users WHERE store_id = 1 AND is_master = 1');

    let storeAdminCredentials = null;
    if (existingStoreAdmin) {
      console.log(`ℹ️ Administrador Master da Loja 1 já existe: ${existingStoreAdmin.username}`);
    } else {
      const username = process.env.INITIAL_STORE_ADMIN_USER || (process.stdin.isTTY ? await ask('Nome de usuário do Administrador da Loja', 'emersonlemosbr') : 'emersonlemosbr');
      let password = process.env.INITIAL_STORE_ADMIN_PASSWORD;
      let generated = false;

      if (!password) {
        if (process.stdin.isTTY) {
          const inputPwd = await ask('Senha do Administrador da Loja (pressione Enter para gerar segura)');
          if (inputPwd && inputPwd.length >= 8) {
            password = inputPwd;
          }
        }
        if (!password) {
          password = generateSecurePassword(16);
          generated = true;
        }
      }

      const hash = bcrypt.hashSync(password, 10);
      await db.query(`
        INSERT INTO users (store_id, full_name, username, password_hash, role, active, is_master, job_title, permissions)
        VALUES (1, 'Emerson Lemos', $1, $2, 'admin', 1, 1, 'Proprietário', '{}')
      `, [username.toLowerCase(), hash]);

      storeAdminCredentials = { username, password, generated };
      console.log(`✅ Usuário Administrador Master da Loja criado com sucesso!`);
    }

    // Inicializar sequências de numeração se não existirem
    await db.query(`
      INSERT INTO document_sequences (store_id, kind, next_value)
      VALUES (1, 'order', 1), (1, 'sale', 1), (1, 'device_sale', 1)
      ON CONFLICT (store_id, kind) DO NOTHING
    `);

    // Resumo final
    console.log('\n================================================================');
    console.log('   🎉 BANCO DE DADOS POSTGRESQL PRONTO COM SUCESSO!            ');
    console.log('================================================================');

    if (superAdminCredentials) {
      console.log('\n[CREDENCIAIS DA PLATAFORMA (SUPERADMIN)]:');
      console.log(`  E-mail: ${superAdminCredentials.email}`);
      console.log(`  Senha:  ${superAdminCredentials.password}`);
      if (superAdminCredentials.generated) {
        console.log('  ⚠️ A senha acima foi gerada aleatoriamente. Guarde-a em um local seguro!');
      }
    }

    if (storeAdminCredentials) {
      console.log('\n[CREDENCIAIS DO SISTEMA ERP (LOJA 1)]:');
      console.log(`  Usuário: ${storeAdminCredentials.username}`);
      console.log(`  Senha:   ${storeAdminCredentials.password}`);
      if (storeAdminCredentials.generated) {
        console.log('  ⚠️ A senha acima foi gerada aleatoriamente. Guarde-a em um local seguro!');
      }
    }

    console.log('\nO banco de dados novo está vazio de registros antigos e estruturado para o ERP.');
    console.log('================================================================\n');

    process.exit(0);
  } catch (err) {
    const errorMsg = err.message || String(err);
    console.error('\n❌ Erro durante o bootstrap do PostgreSQL:', errorMsg);

    if (errorMsg.includes('tenant/user') && errorMsg.includes('not found')) {
      console.error('\n💡 [DIAGNÓSTICO SUPABASE - POOLER]:');
      console.error('   O pooler do Supabase retornou "tenant/user not found".');
      console.error('   Causa provável: A região no endereço do pooler (ex: aws-0-sa-east-1) não corresponde à região');
      console.error('   onde o projeto foi criado no Supabase (ex: aws-0-us-east-1).');
      console.error('   Como resolver:');
      console.error('   1. Acesse o painel do Supabase: Project Settings > Database > Connection string > URI.');
      console.error('   2. Verifique o host exato do pooler para o seu projeto (ex: aws-0-us-east-1.pooler.supabase.com).');
      console.error('   3. Como alternativa, você pode usar a Conexão Direta (Porta 5432):');
      console.error('      postgresql://postgres:[SUA-SENHA]@db.[PROJECT-REF].supabase.co:5432/postgres\n');
    } else if (err.code === 'ENOTFOUND') {
      console.error('\n💡 [DIAGNÓSTICO SUPABASE - DNS]:');
      console.error('   Não foi possível resolver o hostname (getaddrinfo ENOTFOUND).');
      console.error('   Certifique-se de que a DATABASE_URL no arquivo .env esteja entre aspas duplas,');
      console.error('   especialmente se a senha contiver caracteres especiais como "#" ou "?":');
      console.error('   DATABASE_URL="postgresql://postgres.xxx:senha@host:port/postgres"\n');
    } else if (err.code === '28P01') {
      console.error('\n💡 [DIAGNÓSTICO SUPABASE - AUTENTICAÇÃO]:');
      console.error('   Falha na autenticação de senha ("password authentication failed").');
      console.error('   Redefina sua senha no Supabase em Project Settings > Database > Reset database password');
      console.error('   e atualize a DATABASE_URL no arquivo .env.\n');
    }

    process.exit(1);
  }
}

runBootstrap();
