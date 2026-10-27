// services/googleAuthService.js
const https = require('https');

/**
 * Validação oficial de ID Token do Google Identity Services (GSI)
 * Valida assinatura através do endpoint de tokeninfo do Google,
 * além de verificar emissor, expiração, audiência e status de e-mail verificado.
 *
 * @param {string} idToken - Token JWT emitido pelo Google
 * @param {string} [expectedClientId] - Client ID esperado para validação de audiência
 * @returns {Promise<{ sub: string, email: string, name: string, picture?: string, email_verified: boolean }>}
 */
function verifyGoogleIdToken(idToken, expectedClientId) {
  return new Promise((resolve, reject) => {
    if (!idToken || typeof idToken !== 'string') {
      return reject(new Error('Credencial do Google não fornecida ou inválida.'));
    }

    const cleanToken = idToken.trim();
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(cleanToken)}`;

    const req = https.get(url, (resp) => {
      let data = '';
      resp.on('data', (chunk) => {
        data += chunk;
      });

      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (resp.statusCode !== 200) {
            const errorDesc = parsed.error_description || parsed.error || 'Token inválido ou expirado.';
            const err = new Error(`Token do Google inválido: ${errorDesc}`);
            err.code = 'INVALID_GOOGLE_TOKEN';
            return reject(err);
          }

          // 1. Validar expiração
          const nowSec = Math.floor(Date.now() / 1000);
          if (parsed.exp && Number(parsed.exp) < nowSec) {
            return reject(new Error('Token do Google expirado. Faça login novamente.'));
          }

          // 2. Validar emissor
          const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
          if (parsed.iss && !validIssuers.includes(parsed.iss)) {
            return reject(new Error('Emissor do token Google inválido.'));
          }

          // 3. Validar audiência se Client ID configurado
          if (expectedClientId) {
            const cleanExpected = expectedClientId.trim();
            if (parsed.aud !== cleanExpected) {
              return reject(new Error('Audiência do token Google incompatível com o Client ID configurado.'));
            }
          }

          // 4. Validar se o e-mail está verificado pela conta Google
          const isEmailVerified = parsed.email_verified === 'true' || parsed.email_verified === true;
          if (!isEmailVerified) {
            return reject(new Error('O e-mail da conta Google informada não está verificado.'));
          }

          if (!parsed.email) {
            return reject(new Error('E-mail não fornecido pelo provedor Google.'));
          }

          resolve({
            sub: parsed.sub,
            email: parsed.email.toLowerCase().trim(),
            name: parsed.name || parsed.given_name || 'Usuário Google',
            picture: parsed.picture || null,
            email_verified: isEmailVerified,
          });
        } catch (e) {
          reject(new Error('Falha ao processar resposta da verificação Google.'));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error('Falha de conexão com os servidores do Google: ' + (err.message || 'Erro de rede')));
    });

    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Tempo limite excedido ao validar credencial com o Google.'));
    });
  });
}

module.exports = {
  verifyGoogleIdToken,
};
