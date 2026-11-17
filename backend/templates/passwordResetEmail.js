/**
 * Template de E-mail de Recuperação de Senha — iTech ERP
 *
 * Módulo reutilizável e isolado para renderização do layout HTML e versão texto puro.
 * Compatível com os principais clientes de e-mail (Gmail, Outlook, Apple Mail, Thunderbird).
 *
 * @param {Object} params
 * @param {string} [params.userName] - Nome do usuário ou proprietário da loja
 * @param {string} [params.resetUrl] - Link seguro para redefinição de senha
 * @param {string} [params.logoUrl] - URL absoluta pública ou data URI da logo oficial
 * @param {string} [params.systemName] - Nome institucional do sistema (padrão: "iTech ERP")
 * @param {string} [params.validityText] - Texto informativo sobre validade (ex: "60 minutos")
 * @returns {{ html: string, text: string }}
 */
function renderPasswordResetEmail({
  userName = '',
  resetUrl = 'https://itechcloud.app/redefinir-senha?token=DEMO_TOKEN',
  logoUrl = 'https://itechcloud.app/assets/itech-logo-DFKQ73Sa.png',
  systemName = 'iTech ERP',
  validityText = '60 minutos'
} = {}) {
  const greeting = userName && String(userName).trim()
    ? `Olá, <strong>${escapeHtml(userName.trim())}</strong>.`
    : 'Olá.'

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Redefinição de senha — ${escapeHtml(systemName)}</title>
  <!--[if mso]>
  <style type="text/css">
    table {border-collapse:collapse;border-spacing:0;margin:0;}
    td {padding:0;}
    div, span, a, p, h1, h2, h3, h4, h5, h6 {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; display: block; }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      min-width: 100% !important;
      height: 100% !important;
      background-color: #f4f5f7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #111111;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      max-width: 580px !important;
      width: 100% !important;
      margin: 0 auto !important;
    }
    .action-button {
      background-color: #FFBE0B !important;
      color: #000000 !important;
      text-decoration: none !important;
      font-weight: 700 !important;
      font-size: 16px !important;
      padding: 15px 36px !important;
      border-radius: 8px !important;
      display: inline-block !important;
      mso-padding-alt: 0;
      text-align: center !important;
      letter-spacing: 0.2px;
    }
    .action-button:hover {
      background-color: #f5b400 !important;
    }
    @media only screen and (max-width: 600px) {
      .card-body {
        padding: 32px 22px !important;
      }
      .mobile-padding {
        padding-left: 14px !important;
        padding-right: 14px !important;
      }
      .logo-img {
        width: 86px !important;
        height: auto !important;
      }
      .btn-table {
        width: 100% !important;
      }
      .action-button {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box !important;
        padding: 15px 20px !important;
      }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <!-- Preheader oculto para clientes de e-mail -->
  <div style="display:none; font-size:1px; color:#f4f5f7; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
    Recebemos uma solicitação para redefinir a senha da sua conta no ${escapeHtml(systemName)}.
  </div>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f5f7; width:100% !important; margin:0; padding:0;">
    <tr>
      <td align="center" style="padding: 44px 16px 44px 16px;" class="mobile-padding">
        <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="580">
        <tr>
        <td align="center" valign="top" width="580">
        <![endif]-->
        
        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width:580px; width:100%; margin:0 auto; background-color:#ffffff; border-radius:14px; border:1px solid #e5e7eb; box-shadow:0 4px 16px rgba(0,0,0,0.04); overflow:hidden;">
          
          <!-- Cabeçalho com Logomarca Oficial -->
          <tr>
            <td align="center" style="padding: 44px 32px 24px 32px; background-color: #ffffff;">
              <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center">
                    <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(systemName)}" width="98" height="98" class="logo-img" style="width:98px; height:98px; max-width:98px; border-radius:18px; display:block; object-contain:contain; margin:0 auto;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divisória sutil superior -->
          <tr>
            <td style="padding: 0 44px;">
              <div style="border-top: 1px solid #f1f3f5; font-size: 1px; line-height: 1px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Corpo do E-mail -->
          <tr>
            <td align="left" class="card-body" style="padding: 40px 44px 40px 44px; background-color: #ffffff;">
              <!-- Título -->
              <h1 style="margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 25px; font-weight: 800; color: #111111; letter-spacing: -0.5px; line-height: 1.25;">
                Redefinição de senha
              </h1>

              <!-- Parágrafo de Saudação e Mensagem -->
              <p style="margin: 0 0 18px 0; font-size: 16px; line-height: 1.7; color: #2d3748;">
                ${greeting} Recebemos uma solicitação para redefinir a senha da sua conta no <strong>${escapeHtml(systemName)}</strong>.
              </p>

              <p style="margin: 0 0 36px 0; font-size: 16px; line-height: 1.7; color: #2d3748;">
                Para criar uma nova senha e recuperar o acesso à sua conta, clique no botão abaixo.
              </p>

              <!-- Botão de Ação Destacado -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" class="btn-table" style="margin: 0 0 36px 0;">
                <tr>
                  <td align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(resetUrl)}" style="height:52px;v-text-anchor:middle;width:250px;" arcsize="16%" stroke="f" fillcolor="#FFBE0B">
                      <w:anchorlock/>
                      <center style="color:#000000;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">
                        Redefinir minha senha
                      </center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${escapeHtml(resetUrl)}" target="_blank" rel="noopener noreferrer" class="action-button" style="background-color:#FFBE0B; color:#000000; text-decoration:none; font-weight:700; font-size:16px; padding:15px 36px; border-radius:8px; display:inline-block; text-align:center; box-shadow:0 3px 8px rgba(255, 190, 11, 0.35);">
                      Redefinir minha senha
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <!-- Link alternativo se o botão falhar -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fafafa; border-radius: 8px; border: 1px dashed #e5e7eb; margin: 0 0 30px 0;">
                <tr>
                  <td style="padding: 16px 18px;">
                    <p style="margin: 0 0 6px 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                      Se o botão não funcionar, copie e cole o link abaixo no seu navegador:
                    </p>
                    <p style="margin: 0; font-size: 13px; word-break: break-all; line-height: 1.5;">
                      <a href="${escapeHtml(resetUrl)}" target="_blank" rel="noopener noreferrer" style="color: #b45309; text-decoration: underline;">
                        ${escapeHtml(resetUrl)}
                      </a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Aviso de Segurança e Validade -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-left: 3px solid #FFBE0B; background-color: #fffdf5; border-radius: 0 8px 8px 0; margin: 0 0 8px 0;">
                <tr>
                  <td style="padding: 16px 18px;">
                    <p style="margin: 0 0 6px 0; font-size: 13px; color: #4b5563; line-height: 1.5;">
                      Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha atual continuará a mesma.
                    </p>
                    <p style="margin: 0; font-size: 12px; color: #6b7280; font-style: italic; line-height: 1.5;">
                      Por segurança, este link deverá ter validade limitada${validityText ? ` (${escapeHtml(validityText)})` : ''}.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Rodapé Institucional Discreto -->
          <tr>
            <td align="center" style="padding: 24px 32px 32px 32px; background-color: #fafbfc; border-top: 1px solid #f1f3f5;">
              <p style="margin: 0 0 4px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 800; color: #111111; letter-spacing: -0.2px;">
                ${escapeHtml(systemName)}
              </p>
              <p style="margin: 0 0 12px 0; font-size: 12px; color: #6b7280; line-height: 1.4;">
                Gestão inteligente para o seu negócio.
              </p>
              <p style="margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.4;">
                Este é um e-mail automático. Por favor, não responda a esta mensagem.
              </p>
            </td>
          </tr>

        </table>

        <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    `Redefinição de senha — ${systemName}`,
    '========================================',
    '',
    greeting.replace(/<[^>]+>/g, ''),
    `Recebemos uma solicitação para redefinir a senha da sua conta no ${systemName}.`,
    '',
    'Para criar uma nova senha e recuperar o acesso à sua conta, acesse o link abaixo:',
    resetUrl,
    '',
    '----------------------------------------',
    'Avisos de Segurança:',
    '- Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha atual continuará a mesma.',
    `- Por segurança, este link deverá ter validade limitada${validityText ? ` (${validityText})` : ''}.`,
    '',
    '----------------------------------------',
    systemName,
    'Gestão inteligente para o seu negócio.',
    'Este é um e-mail automático. Por favor, não responda a esta mensagem.'
  ].join('\n')

  return { html, text }
}

function escapeHtml(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

module.exports = {
  renderPasswordResetEmail
}
