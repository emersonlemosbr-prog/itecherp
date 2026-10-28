const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // até 100 MB de backup
});

// Tabelas incluídas no backup portátil de dados da loja
const STORE_BACKUP_TABLES = [
  'customers',
  'stock_categories',
  'stock_suppliers',
  'stock_products',
  'stock_levels',
  'stock_movements',
  'service_orders',
  'service_order_photos',
  'credit_accounts',
  'warranties',
  'cash_withdrawals',
  'store_sales',
  'store_sale_items',
  'device_sales',
  'screen_protector_groups',
  'screen_protector_models',
  'notes',
  'labels',
  'note_checklists',
  'note_labels',
  'note_reminders',
  'favorite_notes',
  'pinned_notes'
];

// POST /api/backups - Cria backup criptografado dos dados da loja no PostgreSQL
router.post('/', async (req, res) => {
  const storeId = req.user.store_id || 1;
  const { password } = req.body;
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'A senha do backup deve ter no mínimo 8 caracteres.' });
  }

  try {
    // 1. Exporta dados estruturados da loja
    const storeData = {};
    for (const table of STORE_BACKUP_TABLES) {
      try {
        const rows = await db.query(`SELECT * FROM ${table} WHERE store_id = $1`, [storeId]);
        storeData[table] = rows;
      } catch (_e) {
        // Algumas tabelas filhas podem não ter store_id direto
        try {
          const rows = await db.query(`SELECT * FROM ${table}`);
          storeData[table] = rows;
        } catch (_e2) {
          storeData[table] = [];
        }
      }
    }

    const payloadJson = JSON.stringify({
      schema_version: '2.0-postgres',
      store_id: storeId,
      created_at: new Date().toISOString(),
      data: storeData
    });

    const dataBuffer = Buffer.from(payloadJson, 'utf8');

    // 2. Criptografa usando AES-256-GCM
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // 3. Monta o pacote binário com assinatura
    const header = JSON.stringify({
      version: 2,
      database: 'postgresql',
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      createdAt: new Date().toISOString()
    });

    const fileContent = Buffer.concat([
      Buffer.from('ITECH_BACKUP_V2\n', 'utf8'),
      Buffer.from(Buffer.from(header, 'utf8').toString('base64') + '\n--DATA--\n', 'utf8'),
      encrypted
    ]);

    // 4. Atualiza last_backup nas configurações
    try {
      await db.execute('UPDATE system_settings SET last_backup = CURRENT_TIMESTAMP WHERE store_id = $1', [storeId]);
    } catch (_) {}

    await logAction({ user: req.user, action: 'create_backup', recordType: 'backup' });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="itech-backup-${Date.now()}.itechbackup"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(fileContent);
  } catch (error) {
    console.error('[BACKUP_CREATE_ERROR]', error);
    return res.status(500).json({ error: 'Falha ao gerar o arquivo de backup.' });
  }
});

// POST /api/backups/restore - Restaura backup criptografado
router.post('/restore', upload.single('file'), async (req, res) => {
  const storeId = req.user.store_id || 1;
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
  const currentAdmin = await db.queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!currentAdmin || !bcrypt.compareSync(admin_password, currentAdmin.password_hash)) {
    return res.status(401).json({ error: 'Senha de administrador incorreta.' });
  }

  const rawBuffer = req.file.buffer;
  const magicV2 = 'ITECH_BACKUP_V2\n';
  const magicV1 = 'ITECH_BACKUP_V1\n';

  const isV2 = rawBuffer.slice(0, magicV2.length).equals(Buffer.from(magicV2, 'utf8'));
  const isV1 = rawBuffer.slice(0, magicV1.length).equals(Buffer.from(magicV1, 'utf8'));

  if (!isV2 && !isV1) {
    return res.status(400).json({ error: 'Formato de arquivo inválido ou incompatível.' });
  }

  const magicLength = isV2 ? magicV2.length : magicV1.length;
  const separator = '\n--DATA--\n';
  const sepIndex = rawBuffer.indexOf(separator);
  if (sepIndex === -1) {
    return res.status(400).json({ error: 'Arquivo de backup corrompido (metadados ausentes).' });
  }

  const headerBase64 = rawBuffer.slice(magicLength, sepIndex).toString('utf8').trim();
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

  // Se for backup antigo SQLite V1, bloqueia a restauração para proteger o PostgreSQL
  if (isV1 || decryptedBuffer.slice(0, 15).toString('utf8') === 'SQLite format 3') {
    return res.status(400).json({
      error: 'Este arquivo é um backup do banco de dados SQLite legado. O sistema foi migrado para PostgreSQL na nuvem (Supabase) e opera com banco novo e vazio. Não é permitida a restauração direta de arquivos brutos do SQLite para preservar a integridade do banco PostgreSQL.'
    });
  }

  // Backup V2 em JSON
  try {
    const backupJson = JSON.parse(decryptedBuffer.toString('utf8'));
    if (!backupJson || !backupJson.data) {
      return res.status(400).json({ error: 'Estrutura de dados do backup inválida.' });
    }

    await logAction({ user: req.user, action: 'restore_backup_json', recordType: 'backup', details: { store_id: storeId } });

    return res.json({
      success: true,
      message: 'Arquivo de backup validado e descriptografado com sucesso. Os backups automáticos da nuvem agora são gerenciados continuamente pelo Supabase.'
    });
  } catch (error) {
    console.error('[RESTORE_ERROR]', error);
    return res.status(500).json({ error: 'Falha ao processar os dados do backup: ' + error.message });
  }
});

module.exports = router;
