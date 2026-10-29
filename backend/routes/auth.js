// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { userView, readSettings } = require('../services/settings');
const {
  checkStoreSubscription,
  isNicknameAvailable,
  createStoreWithInitialData,
  getPlatformContactInfo
} = require('../services/multiTenantService');
const googleAuthService = require('../services/googleAuthService');

const router = express.Router();

// Rate limiting simples em memória por IP para prevenção de força bruta no login
const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minuto
  const maxAttempts = 10;

  for (const [key, val] of loginAttempts) {
    if (val.reset <= now) loginAttempts.delete(key);
  }

  let record = loginAttempts.get(ip);
  if (!record) {
    record = { count: 0, reset: now + windowMs };
    loginAttempts.set(ip, record);
  }

  record.count += 1;
  if (record.count > maxAttempts) {
    const retrySec = Math.ceil((record.reset - now) / 1000);
    res.set('Retry-After', String(retrySec));
    return res.status(429).json({ error: `Muitas tentativas de login. Tente novamente em ${retrySec} segundos.` });
  }

  next();
}

/**
 * Retorna dados visuais públicos da loja (nome, logo)
 */
router.get('/branding', async (req, res) => {
  try {
    const storeId = req.query.store_id ? Number(req.query.store_id) : 1;
    const settings = await readSettings(storeId);
    res.json({ name: settings.store.name, logo: settings.store.logo });
  } catch {
    res.json({ name: 'iTech ERP', logo: '' });
  }
});

/**
 * Validação de disponibilidade de nickname em tempo real
 */
router.get('/check-nickname', async (req, res) => {
  try {
    const { nickname } = req.query;
    if (!nickname) {
      return res.status(200).json({ available: false, error: 'Informe um nickname.' });
    }
    const clean = String(nickname).trim();
    if (!/^[\w.@-]{3,60}$/.test(clean)) {
      return res.status(200).json({
        available: false,
        error: 'Nickname deve ter entre 3 e 60 caracteres (letras, números, ponto, hífen ou sublinhado).'
      });
    }
    const available = await isNicknameAvailable(clean);
    return res.status(200).json({
      available,
      nickname: clean,
      message: available ? 'Nickname disponível!' : 'Este nickname já está em uso por outra conta.'
    });
  } catch (err) {
    console.error('[CHECK_NICKNAME_ERROR]', err);
    return res.status(500).json({
      available: null,
      error: 'Não foi possível verificar a disponibilidade no momento. Tente novamente.',
      message: 'Não foi possível verificar a disponibilidade no momento. Tente novamente.'
    });
  }
});

/**
 * Cadastro inicial do cliente (Nova Loja no ERP)
 */
router.post('/register-store', async (req, res) => {
  try {
    const finalStoreName = (req.body.storeName || req.body.store_name || '').trim();
    const finalOwnerName = (req.body.ownerName || req.body.owner_name || '').trim();
    const finalEmail = (req.body.ownerEmail || req.body.email || '').trim().toLowerCase();
    const finalPhone = (req.body.phone || req.body.contactPhone || '').trim();
    const finalNickname = (req.body.nickname || '').trim().toLowerCase();
    const finalErpPassword = req.body.erpPassword || req.body.erp_password || '';
    const finalOwnerPassword = req.body.ownerPassword || req.body.owner_password || finalErpPassword;
    const confirmPass = req.body.confirmErpPassword || req.body.confirmPassword || req.body.confirm_password;
    const googleId = req.body.googleId || null;

    if (!finalStoreName || !finalOwnerName || !finalEmail || !finalNickname || !finalErpPassword) {
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
    }

    if (confirmPass && finalErpPassword !== confirmPass) {
      return res.status(400).json({ error: 'A confirmação de senha do ERP não confere.' });
    }

    if (finalErpPassword.length < 6) {
      return res.status(400).json({ error: 'A senha do ERP deve ter no mínimo 6 caracteres.' });
    }

    const created = await createStoreWithInitialData({
      storeName: finalStoreName,
      ownerName: finalOwnerName,
      ownerEmail: finalEmail,
      phone: finalPhone,
      ownerPassword: finalOwnerPassword,
      googleId,
      nickname: finalNickname,
      erpPassword: finalErpPassword
    });

    res.status(201).json({
      success: true,
      message: 'Cadastro realizado com sucesso! Sua loja está aguardando ativação pela nossa equipe.',
      store: {
        id: created.storeId,
        name: created.storeName,
        store_name: created.storeName,
        owner_name: created.ownerName,
        ownerName: created.ownerName,
        email: created.ownerEmail,
        ownerEmail: created.ownerEmail,
        nickname: created.nickname,
        status: 'pending_activation'
      },
      user: {
        id: created.userId,
        username: created.nickname,
        role: 'admin'
      }
    });
  } catch (err) {
    console.error('[REGISTER_STORE_ERROR]', err);
    res.status(err.statusCode || 400).json({ error: err.message || 'Erro ao realizar cadastro da loja.' });
  }
});

/**
 * Integração Oficial com Google Sign-In (Google Identity Services)
 * Valida ID token do Google e orquestra autenticação, vínculo seguro e cadastro de nova loja.
 */
router.post('/google', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;

  if (!clientId) {
    return res.status(501).json({
      success: false,
      code: 'GOOGLE_AUTH_NOT_CONFIGURED',
      error: 'A autenticação com Google não está configurada neste ambiente.',
      missing_config: {
        GOOGLE_CLIENT_ID: true
      },
      instructions: 'Para ativar o login oficial com Google, configure GOOGLE_CLIENT_ID no arquivo .env do backend e VITE_GOOGLE_CLIENT_ID no frontend/.env.'
    });
  }

  const credential = req.body?.credential || req.body?.idToken;
  const linkPassword = req.body?.linkPassword;
  if (!credential) {
    return res.status(400).json({ success: false, error: 'Credencial do Google não fornecida.' });
  }

  try {
    const googleUser = await googleAuthService.verifyGoogleIdToken(credential, clientId);
    const googleId = googleUser.sub;
    const email = googleUser.email.toLowerCase();
    const name = googleUser.name;

    // 1. Cenário: Usuário já cadastrado com esta conta Google vinculada
    const storeByGoogle = await db.queryOne('SELECT * FROM stores WHERE google_id = $1', [googleId]);
    if (storeByGoogle) {
      let user = await db.queryOne("SELECT * FROM users WHERE store_id = $1 AND role = 'admin' AND active = 1 ORDER BY is_master DESC, id ASC LIMIT 1", [storeByGoogle.id]);
      if (!user) {
        user = await db.queryOne("SELECT * FROM users WHERE store_id = $1 AND active = 1 ORDER BY id ASC LIMIT 1", [storeByGoogle.id]);
      }
      if (!user) {
        return res.status(403).json({ error: 'Nenhum usuário ativo encontrado para esta loja. Entre em contato com a equipe de suporte.' });
      }

      await db.execute('UPDATE stores SET last_access = CURRENT_TIMESTAMP WHERE id = $1', [storeByGoogle.id]);
      await db.execute('UPDATE users SET last_access = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

      const token = jwt.sign(
        {
          id: user.id,
          store_id: storeByGoogle.id,
          username: user.username,
          role: user.role,
          type: 'user',
          session_version: user.session_version || 1
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      const subStatus = await checkStoreSubscription(storeByGoogle);
      if (!subStatus.isAccessible) {
        const isPending = subStatus.status === 'pending_activation';
        return res.status(403).json({
          error: subStatus.reason,
          code: isPending ? 'STORE_PENDING' : 'STORE_SUSPENDED',
          reason: subStatus.reason,
          dueDate: subStatus.dueDate,
          storeName: storeByGoogle.name,
          contact: subStatus.contact || getPlatformContactInfo()
        });
      }

      return res.json({
        status: 'authenticated',
        token,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name || storeByGoogle.owner_name,
          role: user.role,
          store_id: storeByGoogle.id,
          is_master: user.is_master
        },
        store: {
          id: storeByGoogle.id,
          name: storeByGoogle.name,
          owner_name: storeByGoogle.owner_name,
          owner_email: storeByGoogle.owner_email,
          status: subStatus.effectiveStatus || storeByGoogle.status,
          due_date: storeByGoogle.due_date
        }
      });
    }

    // 2. Cenário: Loja já existe com o mesmo e-mail, mas AINDA NÃO vinculada à conta Google
    const storeByEmail = await db.queryOne('SELECT * FROM stores WHERE LOWER(owner_email) = $1', [email]);
    if (storeByEmail) {
      // Se não informou a senha da loja existente, solicitar confirmação de propriedade
      if (!linkPassword) {
        return res.json({
          status: 'needs_link_confirmation',
          store_name: storeByEmail.name,
          email,
          google_id: googleId,
          message: 'Já existe uma loja cadastrada com este e-mail. Para vincular sua conta Google e acessar o sistema com segurança, informe a senha atual da sua loja.'
        });
      }

      // Validar senha informada
      let user = await db.queryOne("SELECT * FROM users WHERE store_id = $1 AND role = 'admin' ORDER BY is_master DESC, id ASC LIMIT 1", [storeByEmail.id]);
      let isMatch = false;

      if (storeByEmail.owner_password_hash) {
        isMatch = await bcrypt.compare(linkPassword, storeByEmail.owner_password_hash);
      }
      if (!isMatch && user && user.password_hash) {
        isMatch = await bcrypt.compare(linkPassword, user.password_hash);
      }

      if (!isMatch) {
        return res.status(401).json({
          error: 'Senha incorreta. Não foi possível confirmar a propriedade da conta existente para vinculação com o Google.',
          needs_link_confirmation: true,
          email
        });
      }

      // Senha validada: vincular google_id com segurança
      await db.execute('UPDATE stores SET google_id = $1, updated_at = CURRENT_TIMESTAMP, last_access = CURRENT_TIMESTAMP WHERE id = $2', [googleId, storeByEmail.id]);
      if (user) {
        await db.execute('UPDATE users SET last_access = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
      }

      const token = jwt.sign(
        {
          id: user ? user.id : 0,
          store_id: storeByEmail.id,
          username: user ? user.username : 'admin',
          role: user ? user.role : 'admin',
          type: 'user',
          session_version: user ? (user.session_version || 1) : 1
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      const subStatus = await checkStoreSubscription(storeByEmail);
      if (!subStatus.isAccessible) {
        const isPending = subStatus.status === 'pending_activation';
        return res.status(403).json({
          error: subStatus.reason,
          code: isPending ? 'STORE_PENDING' : 'STORE_SUSPENDED',
          reason: subStatus.reason,
          dueDate: subStatus.dueDate,
          storeName: storeByEmail.name,
          contact: subStatus.contact || getPlatformContactInfo()
        });
      }

      return res.json({
        status: 'authenticated',
        message: 'Conta Google vinculada com sucesso à sua loja!',
        token,
        user: {
          id: user ? user.id : 0,
          username: user ? user.username : 'admin',
          full_name: user ? user.full_name : storeByEmail.owner_name,
          role: user ? user.role : 'admin',
          store_id: storeByEmail.id
        },
        store: {
          id: storeByEmail.id,
          name: storeByEmail.name,
          owner_name: storeByEmail.owner_name,
          owner_email: storeByEmail.owner_email,
          status: subStatus.effectiveStatus || storeByEmail.status,
          due_date: storeByEmail.due_date
        }
      });
    }

    // 3. Cenário: Usuário novo (não existe loja com esse Google ID nem com esse e-mail)
    return res.json({
      status: 'new_store',
      googleData: {
        googleId,
        email,
        name,
        picture: googleUser.picture || null
      },
      message: 'Conta Google verificada com sucesso. Preencha os dados restantes da loja para concluir o cadastro.'
    });
  } catch (err) {
    console.error('[GOOGLE_AUTH_ERROR]', err);
    res.status(400).json({ error: 'Falha ao autenticar com Google: ' + (err.message || 'Erro inesperado') });
  }
});

/**
 * Solicitação de recuperação de senha segura
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Informe seu e-mail cadastrado.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const store = await db.queryOne('SELECT id, name, owner_name, owner_email FROM stores WHERE LOWER(owner_email) = $1', [cleanEmail]);

    if (!store) {
      // Por segurança, retorna mensagem genérica para não revelar existência de e-mail
      return res.json({
        success: true,
        message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram geradas.'
      });
    }

    // Gerar token criptográfico com validade de 1 hora
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora

    // Invalidar tokens antigos deste e-mail
    await db.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE LOWER(email) = $1 AND used_at IS NULL', [cleanEmail]);

    // Salvar novo token
    await db.execute(`
      INSERT INTO password_reset_tokens (email, token_hash, target_type, target_id, expires_at)
      VALUES ($1, $2, 'owner', $3, $4)
    `, [cleanEmail, tokenHash, store.id, expiresAt]);

    // Log para testes e conferência quando SMTP não configurado
    const resetLink = `http://localhost:5174/recuperar-senha?token=${resetToken}`;
    console.log('========================================================');
    console.log(`[RECUPERAÇÃO DE ACESSO] E-mail: ${cleanEmail}`);
    console.log(`[RECUPERAÇÃO DE ACESSO] Loja: ${store.name}`);
    console.log(`[RECUPERAÇÃO DE ACESSO] Link de Redefinição: ${resetLink}`);
    console.log('========================================================');

    res.json({
      success: true,
      message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram geradas.'
    });
  } catch (err) {
    console.error('[FORGOT_PASSWORD_ERROR]', err);
    res.status(500).json({ error: 'Erro ao processar recuperação de senha.' });
  }
});

/**
 * Validação e redefinição de senha com token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Dados incompletos para redefinição.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 8 caracteres.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'A confirmação de senha não confere.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetRecord = await db.queryOne(`
      SELECT * FROM password_reset_tokens
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    `, [tokenHash]);

    if (!resetRecord) {
      return res.status(400).json({ error: 'Link de redefinição expirado ou inválido.' });
    }

    const hash = bcrypt.hashSync(newPassword, 12);

    await db.transaction(async (tx) => {
      // Atualizar senha do proprietário e do usuário master do ERP daquela loja
      if (resetRecord.target_type === 'owner') {
        await tx.execute('UPDATE stores SET owner_password_hash = $1 WHERE id = $2', [hash, resetRecord.target_id]);
        // Atualiza a senha do usuário master correspondente no ERP
        await tx.execute('UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE store_id = $2 AND is_master = 1', [hash, resetRecord.target_id]);
      }

      // Marcar token como utilizado
      await tx.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [resetRecord.id]);
    });

    res.json({
      success: true,
      message: 'Senha redefinida com sucesso! Você já pode acessar o sistema.'
    });
  } catch (err) {
    console.error('[RESET_PASSWORD_ERROR]', err);
    res.status(400).json({ error: 'Erro ao redefinir senha.' });
  }
});

/**
 * Login operacional no ERP
 */
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Informe usuário e senha.' });
    }

    const user = await db.queryOne('SELECT * FROM users WHERE LOWER(username) = $1', [username.trim().toLowerCase()]);
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    // Verificação de status e assinatura da loja (Multi-Tenant)
    let storeData = null;
    if (user.store_id) {
      const store = await db.queryOne('SELECT * FROM stores WHERE id = $1', [user.store_id]);
      if (!store) {
        return res.status(403).json({ error: 'Loja associada a este usuário não foi encontrada.' });
      }

      const subscription = await checkStoreSubscription(store);
      if (!subscription.isAccessible) {
        const isPending = subscription.status === 'pending_activation';
        return res.status(403).json({
          error: subscription.reason,
          code: isPending ? 'STORE_PENDING' : 'STORE_SUSPENDED',
          reason: subscription.reason,
          dueDate: subscription.dueDate,
          storeName: store.name,
          contact: subscription.contact || getPlatformContactInfo()
        });
      }

      // Se for ativa ou em tolerância
      storeData = {
        id: store.id,
        name: store.name,
        status: subscription.status,
        plan: store.plan,
        due_date: store.due_date,
        in_grace_period: !!subscription.inGracePeriod
      };
    }

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    loginAttempts.delete(ip);

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        store_id: user.store_id,
        session_version: user.session_version
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await logAction({ user, action: 'login', recordType: 'auth' });
    await db.execute('UPDATE users SET last_access = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    if (user.store_id) {
      await db.execute('UPDATE stores SET last_access = CURRENT_TIMESTAMP WHERE id = $1', [user.store_id]);
    }

    res.json({
      token,
      user: userView(user),
      store: storeData
    });
  } catch (error) {
    console.error('[LOGIN_ERROR]', error);
    res.status(500).json({ error: 'Erro ao processar login.' });
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({
    user: req.user,
    store: req.store ? {
      id: req.store.id,
      name: req.store.name,
      status: req.store.status,
      plan: req.store.plan,
      due_date: req.store.due_date
    } : null
  });
});

module.exports = router;
