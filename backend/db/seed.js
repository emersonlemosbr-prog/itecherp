// db/seed.js
// Cria o usuário administrador inicial no PostgreSQL (se ainda não existir).
// Suporta execução assíncrona com PostgreSQL/Supabase.
// Rodar com: npm run seed

const bcrypt = require('bcryptjs');
const db = require('./database');

async function seed() {
  try {
    const existing = await db.queryOne('SELECT id FROM users WHERE LOWER(username) = $1', ['admin']);
    if (existing) {
      const hasMaster = await db.queryOne('SELECT id FROM users WHERE is_master = 1 AND store_id = 1');
      if (!hasMaster) {
        await db.query('UPDATE users SET is_master = 1 WHERE id = $1', [existing.id]);
      }
      console.log('Usuário admin já existe. Nada a fazer.');
      process.exit(0);
      return;
    }

    const hasMasterInStore1 = await db.queryOne('SELECT id FROM users WHERE store_id = 1 AND is_master = 1');
    const passwordHash = bcrypt.hashSync('admin123', 10);
    await db.query(`
      INSERT INTO users (store_id, full_name, username, password_hash, role, is_master, active)
      VALUES (1, $1, $2, $3, $4, $5, 1)
    `, ['Administrador', 'admin', passwordHash, 'admin', hasMasterInStore1 ? 0 : 1]);

    console.log('========================================================');
    console.log(' Usuário administrador criado com sucesso no banco:');
    console.log('   usuário: admin');
    console.log('   senha:   admin123');
    console.log(' IMPORTANTE: troque essa senha depois do primeiro login.');
    console.log('========================================================');
    process.exit(0);
  } catch (err) {
    console.error('[ERRO NO SEED]', err.message);
    process.exit(1);
  }
}

seed();
