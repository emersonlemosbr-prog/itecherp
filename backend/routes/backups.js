const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const Database = require('better-sqlite3');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // até 100 MB de backup
});

function getUniqueTempPath(prefix) {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.db`);
}

// POST /api/backups - Cria backup criptografado do banco de dados SQLite
router.post('/', async (req, res) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'A senha do backup deve ter no mínimo 8 caracteres.' });
  }

  const tempVacuumFile = getUniqueTempPath('itech-backup-vacuum');
  try {
    // 1. Gera cópia consistente via VACUUM INTO
    db.prepare('VACUUM INTO ?').run(tempVacuumFile);
    const dbBuffer = fs.readFileSync(tempVacuumFile);

    // 2. Criptografa o buffer usando AES-256-GCM
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([cipher.update(dbBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // 3. Monta o pacote binário com assinatura
    const header = JSON.stringify({
      version: 1,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      createdAt: new Date().toISOString()
    });

    const fileContent = Buffer.concat([
      Buffer.from('ITECH_BACKUP_V1\n', 'utf8'),
      Buffer.from(Buffer.from(header, 'utf8').toString('base64') + '\n--DATA--\n', 'utf8'),
      encrypted
    ]);

    // 4. Atualiza last_backup nas configurações se a tabela existir
    try {
      db.prepare("UPDATE system_settings SET last_backup = datetime('now') WHERE id = 1").run();
    } catch (_) {}

    logAction({ user: req.user, action: 'create_backup', recordType: 'backup' });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="itech-backup-${Date.now()}.itechbackup"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(fileContent);
  } catch (error) {
    console.error('[BACKUP_CREATE_ERROR]', error);
    return res.status(500).json({ error: 'Falha ao gerar o arquivo de backup.' });
  } finally {
    if (fs.existsSync(tempVacuumFile)) {
      try { fs.unlinkSync(tempVacuumFile); } catch (_) {}
    }
  }
});

// POST /api/backups/restore - Restaura backup criptografado
router.post('/restore', upload.single('file'), async (req, res) => {
  const { password, admin_password, confirmation } = req.body;

  if (confirmation !== 'RESTAURAR') {
    return res.status(400).json({ error: 'Confirmação inválida. Digite RESTAURAR para prosseguir.' });
  }

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'Nenhum arquivo de backup enviado.' });
  }

  if (!password || !admin_password) {
    return res.status(400).json({ error: 'Informe a senha do backup e sua senha de administrador.' });
  }

  // 1. Valida senha atual do administrador logado
  const currentAdmin = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!currentAdmin || !bcrypt.compareSync(admin_password, currentAdmin.password_hash)) {
    return res.status(401).json({ error: 'Senha de administrador incorreta.' });
  }

  const rawBuffer = req.file.buffer;
  const magic = 'ITECH_BACKUP_V1\n';
  if (!rawBuffer.slice(0, magic.length).equals(Buffer.from(magic, 'utf8'))) {
    return res.status(400).json({ error: 'Formato de arquivo inválido ou incompatível.' });
  }

  const separator = '\n--DATA--\n';
  const sepIndex = rawBuffer.indexOf(separator);
  if (sepIndex === -1) {
    return res.status(400).json({ error: 'Arquivo de backup corrompido (metadados ausentes).' });
  }

  const headerBase64 = rawBuffer.slice(magic.length, sepIndex).toString('utf8').trim();
  const encryptedData = rawBuffer.slice(sepIndex + separator.length);

  let metadata;
  try {
    metadata = JSON.parse(Buffer.from(headerBase64, 'base64').toString('utf8'));
  } catch (_) {
    return res.status(400).json({ error: 'Metadados do backup corrompidos.' });
  }

  let decryptedBuffer;
  try {
    const salt = Buffer.from(metadata.salt, 'hex');
    const iv = Buffer.from(metadata.iv, 'hex');
    const authTag = Buffer.from(metadata.authTag, 'hex');
    const key = crypto.scryptSync(password, salt, 32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    decryptedBuffer = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  } catch (_) {
    return res.status(400).json({ error: 'Senha do backup incorreta ou arquivo adulterado.' });
  }

  // 2. Valida integridade do banco descriptografado
  const tempRestoreFile = getUniqueTempPath('itech-restore-check');
  fs.writeFileSync(tempRestoreFile, decryptedBuffer);

  try {
    const testDb = new Database(tempRestoreFile, { readonly: true });
    const check = testDb.pragma('integrity_check', { simple: true });
    testDb.close();
    if (check !== 'ok') {
      throw new Error('Integridade do banco de dados falhou.');
    }
  } catch (error) {
    if (fs.existsSync(tempRestoreFile)) try { fs.unlinkSync(tempRestoreFile); } catch (_) {}
    return res.status(400).json({ error: 'O banco de dados no backup está corrompido.' });
  }

  // 3. Cria backup do banco atual antes de substituir (rollback)
  const currentDbPath = process.env.ITECH_DB_PATH || path.join(__dirname, '../db/itech.db');
  if (fs.existsSync(currentDbPath)) {
    const rollbackDir = path.join(path.dirname(currentDbPath), 'backups');
    fs.mkdirSync(rollbackDir, { recursive: true });
    const rollbackPath = path.join(rollbackDir, `before-restore-${Date.now()}.db`);
    try {
      db.prepare('VACUUM INTO ?').run(rollbackPath);
    } catch (_) {}
  }

  // 4. Substitui o banco de dados
  try {
    // Esvazia as conexões WAL antes de copiar
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) {}
    fs.copyFileSync(tempRestoreFile, currentDbPath);

    // Remove arquivos temporários shm/wal se existirem para evitar inconsistências
    const shmFile = `${currentDbPath}-shm`;
    const walFile = `${currentDbPath}-wal`;
    if (fs.existsSync(shmFile)) try { fs.unlinkSync(shmFile); } catch (_) {}
    if (fs.existsSync(walFile)) try { fs.unlinkSync(walFile); } catch (_) {}

    return res.json({ success: true, message: 'Backup restaurado com sucesso. Reinicie a aplicação.' });
  } catch (error) {
    console.error('[RESTORE_COPY_ERROR]', error);
    return res.status(500).json({ error: 'Falha ao aplicar os dados restaurados.' });
  } finally {
    if (fs.existsSync(tempRestoreFile)) try { fs.unlinkSync(tempRestoreFile); } catch (_) {}
  }
});

module.exports = router;
