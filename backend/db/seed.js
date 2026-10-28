// db/seed.js
// Cria o usuário administrador inicial (se ainda não existir).
// Rodar com: npm run seed

const bcrypt = require('bcryptjs');
const db = require('./database');

function seed() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (existing) {
    if (!db.prepare('SELECT id FROM users WHERE is_master = 1 AND store_id = 1').get()) {
      db.prepare('UPDATE users SET is_master = 1 WHERE id = ?').run(existing.id);
    }
    console.log('Usuário admin já existe. Nada a fazer.');
    return;
  }

  const hasMasterInStore1 = db.prepare('SELECT id FROM users WHERE store_id = 1 AND is_master = 1').get();
  const passwordHash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (store_id, full_name, username, password_hash, role, is_master)
    VALUES (1, ?, ?, ?, ?, ?)
  `).run('Administrador', 'admin', passwordHash, 'admin', hasMasterInStore1 ? 0 : 1);

  console.log('Usuário administrador criado:');
  console.log('  usuário: admin');
  console.log('  senha:   admin123');
  console.log('IMPORTANTE: troque essa senha depois do primeiro login.');
}

seed();
