#!/usr/bin/env node
/**
 * iTech ERP - Procedimento Seguro de Configuração e Redefinição da Senha Mestra do Superadmin
 * 
 * Permite configurar a senha mestra inicial ou redefinir a senha de um Superadmin existente
 * sem credenciais fixas no código, sem vazar senhas em logs e com auditoria registrada.
 * 
 * Uso interativo:
 *   node backend/scripts/setupSuperadmin.js
 * 
 * Uso com parâmetros:
 *   node backend/scripts/setupSuperadmin.js --email admin@itechcelulareinformatica.com.br --password "NovaSenha123"
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

function validatePasswordStrength(pwd) {
  if (!pwd || pwd.length < 8) {
    return 'A senha deve conter no mínimo 8 caracteres.';
  }
  if (!/[a-zA-Z]/.test(pwd) || !/[0-9]/.test(pwd)) {
    return 'A senha deve conter pelo menos uma letra e um número.';
  }
  return null;
}

async function run() {
  console.log('================================================================');
  console.log('   iTech ERP — Gestão Segura de Senha Mestra do Superadmin      ');
  console.log('================================================================\n');

  // 1. Processar argumentos CLI e variáveis de ambiente
  const args = process.argv.slice(2);
  let cliEmail = '';
  let cliPassword = '';
  let cliName = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) cliEmail = args[++i];
    if (args[i] === '--password' && args[i + 1]) cliPassword = args[++i];
    if (args[i] === '--name' && args[i + 1]) cliName = args[++i];
  }

  // 2. Buscar contas de Superadmin existentes
  const existingAdmins = await db.query(
    'SELECT id, name, email, role, active, session_version, created_at, last_access FROM platform_users WHERE role = $1 ORDER BY id ASC',
    ['superadmin']
  );

  let targetAdmin = null;

  if (existingAdmins.length === 0) {
    console.log('ℹ️ Nenhuma conta de Superadmin encontrada. Iniciando configuração inicial da credencial mestra...\n');

    let email = cliEmail || process.env.INITIAL_SUPERADMIN_EMAIL;
    if (!email && process.stdin.isTTY) {
      email = await askQuestion('E-mail do Superadmin: ');
    }
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      console.error('\n❌ ERRO: E-mail inválido ou ausente.');
      process.exit(1);
    }

    let name = cliName || process.env.INITIAL_SUPERADMIN_NAME;
    if (!name && process.stdin.isTTY) {
      name = await askQuestion('Nome completo do Superadmin [Superadmin iTech]: ');
    }
    const cleanName = (name || 'Superadmin iTech').trim();

    let password = cliPassword || process.env.INITIAL_SUPERADMIN_PASSWORD;
    if (!password && process.stdin.isTTY) {
      password = await askQuestion('Nova senha mestra (mínimo 8 caracteres): ');
    }

    const pwdError = validatePasswordStrength(password);
    if (pwdError) {
      console.error(`\n❌ ERRO: ${pwdError}`);
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 12);
    const insertRes = await db.execute(`
      INSERT INTO platform_users (name, email, password_hash, role, active, session_version)
      VALUES ($1, $2, $3, 'superadmin', 1, 1)
      RETURNING id
    `, [cleanName, cleanEmail, hash]);

    // Registrar em auditoria
    await db.query(`
      INSERT INTO platform_audit_logs (platform_user_id, platform_user_name, action, target_type, target_name, details, ip_address)
      VALUES ($1, $2, 'superadmin_initial_password_setup', 'platform_user', $3, 'Configuração inicial da credencial mestra via CLI', 'cli')
    `, [insertRes.id || null, cleanName, cleanEmail]);

    console.log('\n✅ SUCESSO: Credencial mestra criada com êxito!');
    console.log(`   ID:      ${insertRes.id || 1}`);
    console.log(`   Nome:    ${cleanName}`);
    console.log(`   E-mail:  ${cleanEmail}`);
    console.log('   Status:  Ativo');
    console.log('\nPainel de Acesso à Plataforma: /admin-plataforma');
    console.log('================================================================\n');
    process.exit(0);
  }

  // Se já existem contas de Superadmin
  console.log(`ℹ️ Foram encontrados ${existingAdmins.length} Superadmin(s) cadastrado(s):\n`);
  existingAdmins.forEach((adm, idx) => {
    console.log(`  [${idx + 1}] ID: ${adm.id} | ${adm.name} (${adm.email}) | Ativo: ${adm.active ? 'Sim' : 'Não'}`);
  });
  console.log('');

  if (cliEmail) {
    targetAdmin = existingAdmins.find(a => a.email.toLowerCase() === cliEmail.trim().toLowerCase());
    if (!targetAdmin) {
      console.error(`\n❌ ERRO: Superadmin com e-mail "${cliEmail}" não encontrado.`);
      process.exit(1);
    }
  } else if (existingAdmins.length === 1) {
    targetAdmin = existingAdmins[0];
  } else if (process.stdin.isTTY) {
    const choice = await askQuestion(`Selecione o número do Superadmin a redefinir [1-${existingAdmins.length}]: `);
    const num = parseInt(choice, 10);
    if (!num || num < 1 || num > existingAdmins.length) {
      console.error('\n❌ Opção inválida.');
      process.exit(1);
    }
    targetAdmin = existingAdmins[num - 1];
  } else {
    targetAdmin = existingAdmins[0];
  }

  console.log(`\n🎯 Redefinindo senha mestra de: ${targetAdmin.name} (${targetAdmin.email})`);

  let newPassword = cliPassword;
  if (!newPassword && process.stdin.isTTY) {
    newPassword = await askQuestion('Digite a nova senha mestra (mínimo 8 caracteres): ');
  }

  const pwdError = validatePasswordStrength(newPassword);
  if (pwdError) {
    console.error(`\n❌ ERRO: ${pwdError}`);
    process.exit(1);
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  const newSessionVersion = (targetAdmin.session_version || 0) + 1;

  await db.execute(`
    UPDATE platform_users
    SET password_hash = $1,
        active = 1,
        session_version = $2,
        last_access = CURRENT_TIMESTAMP
    WHERE id = $3
  `, [newHash, newSessionVersion, targetAdmin.id]);

  // Registrar em auditoria sem registrar senhas
  await db.query(`
    INSERT INTO platform_audit_logs (platform_user_id, platform_user_name, action, target_type, target_name, details, ip_address)
    VALUES ($1, $2, 'superadmin_password_reset_cli', 'platform_user', $3, 'Senha mestra redefinida com sucesso via comando CLI local/servidor', 'cli')
  `, [targetAdmin.id, targetAdmin.name, targetAdmin.email]);

  console.log('\n================================================================');
  console.log('✅ SUCESSO: Senha mestra do Superadmin atualizada!');
  console.log(`   Usuário: ${targetAdmin.name} (${targetAdmin.email})`);
  console.log(`   Versão de Sessão: ${newSessionVersion} (todas as sessões anteriores foram invalidadas)`);
  console.log('   Status da Conta:  Ativa');
  console.log('\nVocê já pode realizar o login no painel: /admin-plataforma');
  console.log('================================================================\n');
  process.exit(0);
}

run().catch((err) => {
  const msg = err.message || String(err);
  console.error('\n❌ [ERRO DE BANCO/CONEXÃO]:', msg);

  if (msg.includes('tenant/user') && msg.includes('not found')) {
    console.error('\n💡 [DIAGNÓSTICO SUPABASE - POOLER]:');
    console.error('   O pooler do Supabase retornou "tenant/user not found".');
    console.error('   Verifique a região do seu projeto no Supabase:');
    console.error('   Se o projeto foi criado em North Virginia (us-east-1), use: aws-0-us-east-1.pooler.supabase.com');
    console.error('   Se foi criado em São Paulo (sa-east-1), use: aws-0-sa-east-1.pooler.supabase.com');
    console.error('   Ou utilize a conexão direta (porta 5432): db.[PROJECT-REF].supabase.co:5432\n');
  } else if (err.code === 'ENOTFOUND') {
    console.error('\n💡 [DIAGNÓSTICO SUPABASE - DNS]:');
    console.error('   Não foi possível resolver o hostname. Certifique-se de que a DATABASE_URL');
    console.error('   no arquivo .env esteja entre aspas duplas: DATABASE_URL="..."\n');
  }

  process.exit(1);
});
