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
const { renderPasswordResetEmail } = require('../templates/passwordResetEmail');
const { sendEmail, getAppBaseUrl, getOfficialLogoUrl } = require('../services/emailService');

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

// Rate limiting para solicitação de recuperação de senha por IP (5 requisições por 15 minutos)
const forgotAttempts = new Map();
// Rate limiting por conta/e-mail para evitar bombardeio e DoS de caixa de entrada (3 solicitações ativas a cada 10 minutos)
const accountForgotAttempts = new Map();

function forgotPasswordRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutos
  const maxAttempts = 5;

  for (const [key, val] of forgotAttempts) {
    if (val.reset <= now) forgotAttempts.delete(key);
  }

  let record = forgotAttempts.get(ip);
  if (!record) {
    record = { count: 0, reset: now + windowMs };
    forgotAttempts.set(ip, record);
  }

  record.count += 1;
  if (record.count > maxAttempts) {
    const retrySec = Math.ceil((record.reset - now) / 1000);
    res.set('Retry-After', String(retrySec));
    return res.status(429).json({ error: `Muitas solicitações de recuperação. Tente novamente em ${Math.ceil(retrySec / 60)} minutos.` });
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
          due_date: storeByGoogle.due_date,
          is_suspended: (subStatus.effectiveStatus || storeByGoogle.status) === 'suspended',
          suspended_at: storeByGoogle.suspended_at || subStatus.suspendedAt || null,
          suspension_reason: storeByGoogle.suspension_reason || subStatus.reason || null
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
          due_date: storeByEmail.due_date,
          is_suspended: (subStatus.effectiveStatus || storeByEmail.status) === 'suspended',
          suspended_at: storeByEmail.suspended_at || subStatus.suspendedAt || null,
          suspension_reason: storeByEmail.suspension_reason || subStatus.reason || null
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
 * Localiza contas associadas a um e-mail cadastrado (proprietário de loja ou usuário de acesso).
 * Trata defensivamente a ausência da coluna users.email caso a migration correspondente
 * ainda não tenha sido executada em produção, evitando erros 500 não tratados.
 */
async function findAccountsByEmail(cleanEmail) {
  const accounts = [];

  // 1. Buscar loja pelo owner_email
  try {
    const store = await db.queryOne(
      'SELECT id, name, owner_name, owner_email FROM stores WHERE LOWER(owner_email) = $1',
      [cleanEmail]
    );
    if (store) {
      accounts.push({
        type: 'owner',
        id: store.id,
        storeId: store.id,
        email: store.owner_email,
        name: store.owner_name || store.name
      });
    }
  } catch (err) {
    console.error('[AUTH_FIND_OWNER_ERROR]', err?.message || err);
  }

  // 2. Buscar usuário pelo users.email (tratamento defensivo se coluna não existir)
  try {
    const users = await db.query(
      'SELECT id, store_id, full_name, username, email FROM users WHERE LOWER(email) = $1 AND active = 1',
      [cleanEmail]
    );
    if (Array.isArray(users)) {
      for (const u of users) {
        accounts.push({
          type: 'user',
          id: u.id,
          storeId: u.store_id,
          email: u.email,
          name: u.full_name || u.username
        });
      }
    }
  } catch (err) {
    const msg = String(err?.message || '').toLowerCase();
    const isMissingColumn =
      err?.code === '42703' ||
      msg.includes('no such column') ||
      msg.includes('does not exist');

    if (isMissingColumn) {
      console.warn('[AUTH_WARN] Coluna users.email não identificada no banco atual. Recuperação restrita ao proprietário da loja até a execução da migration.');
    } else {
      console.error('[AUTH_FIND_USER_ERROR]', err?.message || err);
    }
  }

  return accounts;
}

/**
 * Solicitação de recuperação de senha segura
 */
router.post('/forgot-password', forgotPasswordRateLimit, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Informe seu e-mail cadastrado.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      // Retorna a mesma mensagem genérica por segurança
      return res.json({
        success: true,
        message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas.'
      });
    }

    // Rate limiting por conta: evita que um atacante bombardeie o e-mail da vítima
    const now = Date.now();
    for (const [key, val] of accountForgotAttempts) {
      if (val.reset <= now) accountForgotAttempts.delete(key);
    }
    const acctRecord = accountForgotAttempts.get(cleanEmail);
    if (acctRecord && acctRecord.count >= 3 && acctRecord.reset > now) {
      // Retorna sucesso genérico para não vazar a existência da conta
      return res.json({
        success: true,
        message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas.'
      });
    }
    if (!acctRecord) {
      accountForgotAttempts.set(cleanEmail, { count: 1, reset: now + 10 * 60 * 1000 });
    } else {
      acctRecord.count += 1;
    }

    const accounts = await findAccountsByEmail(cleanEmail);

    if (accounts.length === 0) {
      // Por segurança, retorna mensagem genérica para não revelar existência de e-mail (timing mitigado)
      return res.json({
        success: true,
        message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas.'
      });
    }

    if (accounts.length > 1) {
      // Ambiguidade detectada (múltiplas contas com o mesmo e-mail por dados legados/inconsistentes)
      // Por segurança extrema, rejeita a geração do token para evitar comprometer a conta errada,
      // loga o alerta interno e retorna a mesma resposta genérica ao solicitante.
      console.warn('[FORGOT_PASSWORD_AMBIGUITY] Ambiguidade na recuperação de senha:', {
        email: cleanEmail,
        count: accounts.length
      });
      return res.json({
        success: true,
        message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas.'
      });
    }

    const targetAccount = accounts[0];

    // Gerar token criptograficamente seguro com validade estrita de 30 minutos
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutos

    // Invalidar tokens antigos pendentes deste e-mail
    await db.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE LOWER(email) = $1 AND used_at IS NULL', [cleanEmail]);

    // Salvar novo token (apenas o hash SHA-256) com target_type ('owner' ou 'user') e target_id
    await db.execute(`
      INSERT INTO password_reset_tokens (email, token_hash, target_type, target_id, expires_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [cleanEmail, tokenHash, targetAccount.type, targetAccount.id, expiresAt]);

    // Montar URL pública oficial para redefinição
    const appBaseUrl = getAppBaseUrl();
    const resetUrl = `${appBaseUrl}/redefinir-senha?token=${resetToken}&email=${encodeURIComponent(cleanEmail)}`;
    const logoUrl = getOfficialLogoUrl();

    // Renderizar template oficial aprovado (HTML + Texto Puro)
    const { html, text } = renderPasswordResetEmail({
      userName: targetAccount.name,
      resetUrl,
      logoUrl,
      systemName: 'iTech ERP',
      validityText: '30 minutos'
    });

    // Enviar e-mail de forma assíncrona/segura via Resend
    const sendResult = await sendEmail({
      to: cleanEmail,
      subject: 'Redefinição de senha — iTech ERP',
      html,
      text
    });

    if (!sendResult.success) {
      console.error('[FORGOT_PASSWORD_EMAIL_FAILURE]', {
        email: cleanEmail,
        error: sendResult.error
      });
      // Não expor o erro detalhado ao solicitante para evitar enumeração e vazamento
    }

    res.json({
      success: true,
      message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas.'
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
    const { token, newPassword, confirmPassword, new_password } = req.body;
    const finalPassword = newPassword || new_password;

    if (!token || !finalPassword) {
      return res.status(400).json({ error: 'Dados incompletos para redefinição.' });
    }

    if (finalPassword.length < 8) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 8 caracteres.' });
    }

    if (confirmPassword && finalPassword !== confirmPassword) {
      return res.status(400).json({ error: 'A confirmação de senha não confere.' });
    }

    const cleanToken = String(token).trim();
    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

    const resetRecord = await db.queryOne(`
      SELECT * FROM password_reset_tokens
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    `, [tokenHash]);

    if (!resetRecord) {
      return res.status(400).json({ error: 'Link de redefinição expirado ou inválido.' });
    }

    const hash = bcrypt.hashSync(finalPassword, 12);

    await db.transaction(async (tx) => {
      // Re-verificar atomicamente dentro da transação para impedir concorrência/reutilização simultânea
      const checkAtomic = await tx.queryOne(`
        SELECT id, target_type, target_id FROM password_reset_tokens
        WHERE id = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      `, [resetRecord.id]);

      if (!checkAtomic) {
        throw new Error('TOKEN_ALREADY_USED');
      }

      // Atualizar senha do proprietário e do usuário master do ERP daquela loja
      if (checkAtomic.target_type === 'owner') {
        await tx.execute('UPDATE stores SET owner_password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hash, checkAtomic.target_id]);
        // Atualiza a senha do usuário master e invalida sessões anteriores via session_version
        await tx.execute('UPDATE users SET password_hash = $1, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE store_id = $2 AND is_master = 1', [hash, checkAtomic.target_id]);
      } else if (checkAtomic.target_type === 'user') {
        await tx.execute('UPDATE users SET password_hash = $1, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hash, checkAtomic.target_id]);
      }

      // Consumir o token marcando used_at
      await tx.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [checkAtomic.id]);
    });

    res.json({
      success: true,
      message: 'Senha redefinida com sucesso! Você já pode acessar o sistema.'
    });
  } catch (err) {
    if (err.message === 'TOKEN_ALREADY_USED') {
      return res.status(400).json({ error: 'Este link de redefinição já foi utilizado ou expirou.' });
    }
    console.error('[RESET_PASSWORD_ERROR]', err);
    res.status(400).json({ error: 'Erro ao redefinir senha.' });
  }
});
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

      // Se for ativa, em tolerância ou suspensa (acesso restrito)
      storeData = {
        id: store.id,
        name: store.name,
        status: subscription.status,
        plan: store.plan,
        due_date: store.due_date,
        in_grace_period: !!subscription.inGracePeriod,
        is_suspended: subscription.status === 'suspended',
        suspended_at: store.suspended_at || subscription.suspendedAt || null,
        suspension_reason: store.suspension_reason || subscription.reason || null
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
      due_date: req.store.due_date,
      is_suspended: req.store.status === 'suspended',
      suspended_at: req.store.suspended_at || null,
      suspension_reason: req.store.suspension_reason || null
    } : null
  });
});

router.findAccountsByEmail = findAccountsByEmail;

module.exports = router;
