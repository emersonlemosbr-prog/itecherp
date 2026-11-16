const { Resend } = require('resend');

/**
 * Serviço de E-mail — iTech ERP
 * Integração oficial com Resend para envio de e-mails transacionais.
 *
 * Variáveis de ambiente utilizadas:
 * - RESEND_API_KEY: Chave de API do Resend (obrigatória para envio real)
 * - EMAIL_FROM: Remetente configurado (ex: "iTech ERP <noreply@seudominio.com.br>")
 * - APP_BASE_URL: URL base pública do ERP (ex: "https://erp.itechcelulareinformatica.com.br")
 */

let resendClient = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey.trim());
  }
  return resendClient;
}

/**
 * Envia um e-mail transacional via Resend.
 *
 * @param {Object} options
 * @param {string|string[]} options.to - Destinatário(s)
 * @param {string} options.subject - Assunto do e-mail
 * @param {string} options.html - Conteúdo HTML
 * @param {string} [options.text] - Conteúdo em texto puro
 * @param {string} [options.from] - Remetente opcional para sobrescrever o padrão
 * @returns {Promise<{ success: boolean, id?: string, simulated?: boolean, error?: string }>}
 */
async function sendEmail({ to, subject, html, text, from }) {
  const defaultFrom = process.env.EMAIL_FROM || 'iTech ERP <noreply@itechcelulareinformatica.com.br>';
  const sender = (from && from.trim()) || defaultFrom;

  const client = getResendClient();

  // Modo Simulado: se a chave do Resend não estiver configurada ou for ambiente de teste/simulação explícita
  if (!client || process.env.NODE_ENV === 'test' || process.env.RESEND_SIMULATE === 'true') {
    // Alerta de segurança: se estiver em produção real e a chave não estiver configurada, registrar erro crítico
    if (process.env.NODE_ENV === 'production' && !process.env.RESEND_SIMULATE) {
      console.error('[CRITICAL_EMAIL_CONFIG] RESEND_API_KEY não configurada no ambiente de produção. O e-mail não pôde ser enviado externamente.');
      return {
        success: false,
        error: 'Serviço de e-mail não configurado em produção.'
      };
    }

    if (process.env.NODE_ENV !== 'test') {
      console.log('----------------------------------------------------');
      console.log('[EMAIL_SERVICE] MODO SIMULADO ATIVO (Sem chamadas externas).');
      console.log(`[EMAIL_SERVICE] Destinatário: ${Array.isArray(to) ? to.join(', ') : to}`);
      console.log(`[EMAIL_SERVICE] Assunto: ${subject}`);
      console.log(`[EMAIL_SERVICE] Remetente: ${sender}`);
      console.log('----------------------------------------------------');
    }
    return {
      success: true,
      simulated: true,
      id: 'simulated_' + Date.now()
    };
  }

  try {
    const payload = {
      from: sender,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || undefined
    };

    const response = await client.emails.send(payload);

    if (response.error) {
      console.error('[EMAIL_SERVICE_RESEND_ERROR]', {
        message: response.error.message,
        name: response.error.name
      });
      return {
        success: false,
        error: response.error.message || 'Falha ao enviar e-mail via Resend'
      };
    }

    return {
      success: true,
      id: response.data?.id
    };
  } catch (err) {
    console.error('[EMAIL_SERVICE_UNEXPECTED_ERROR]', {
      message: err.message,
      code: err.code
    });
    return {
      success: false,
      error: 'Erro de comunicação com o provedor de e-mail.'
    };
  }
}

/**
 * Retorna a URL base do ERP formatada sem barra final.
 * Fallback seguro para o domínio oficial em produção caso não configurado.
 */
function getAppBaseUrl() {
  const envUrl = process.env.APP_BASE_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'https://erp.itechcelulareinformatica.com.br';
}

/**
 * Retorna a URL pública oficial da logomarca do ERP.
 */
function getOfficialLogoUrl() {
  const envLogo = process.env.APP_LOGO_URL;
  if (envLogo && envLogo.trim()) {
    return envLogo.trim();
  }
  return `${getAppBaseUrl()}/itech-logo.png`;
}

module.exports = {
  sendEmail,
  getResendClient,
  getAppBaseUrl,
  getOfficialLogoUrl
};
