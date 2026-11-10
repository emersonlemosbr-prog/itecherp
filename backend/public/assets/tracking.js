const labels = { received: 'Recebido', diagnosis: 'Em Diagnóstico', waiting_parts: 'Aguardando Peças', repairing: 'Em Reparo', ready: 'Pronto para Retirada', delivered: 'Entregue', not_performed: 'Reparo Não Realizado' };
const element = id => document.getElementById(id);
function formatOrderNumber(value) {
  const number = String(value ?? '').trim().replace(/^(?:(?:SO|OS)[\s-]*)+/i, '');
  return number ? `OS-${number}` : 'OS';
}
function date(value) {
  if (!value) return '—';
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value.replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(value) ? '' : 'Z'));
  return Number.isNaN(parsed.getTime()) ? '—' : value.length === 10 ? parsed.toLocaleDateString('pt-BR') : parsed.toLocaleString('pt-BR');
}
function formatCnpjLine(value) {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!clean) return '';
  return /^cnpj\s*:/i.test(clean) ? clean : `CNPJ: ${clean}`;
}
function updateCompanyBranding(order) {
  const logoEl = element('company-logo');
  const nameEl = element('company-name');
  const cnpjEl = element('company-cnpj');
  const companyName = typeof order?.company_name === 'string' ? order.company_name.trim() : '';
  const companyCnpj = formatCnpjLine(order?.company_cnpj);
  const companyLogo = typeof order?.company_logo === 'string' ? order.company_logo.trim() : '';

  if (logoEl) {
    if (companyLogo) {
      logoEl.src = companyLogo;
      logoEl.alt = companyName || 'Logo da empresa';
      logoEl.hidden = false;
    } else {
      logoEl.hidden = true;
      logoEl.removeAttribute('src');
    }
  }

  if (nameEl) {
    nameEl.textContent = companyName;
    nameEl.hidden = !companyName;
  }
  if (cnpjEl) {
    cnpjEl.textContent = companyCnpj;
    cnpjEl.hidden = !companyCnpj;
  }
}
const token = location.pathname.split('/')[2];
if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
  element('connection').dataset.state = 'unavailable';
  element('connection').textContent = 'Link de acompanhamento inválido ou incorreto.';
} else {
  let hasConnected = false;
  let connectionFailedCount = 0;
  const source = new EventSource(`/api/public/service-order/${encodeURIComponent(token)}/events`);

  const initialConnectionTimeout = setTimeout(() => {
    if (!hasConnected) {
      element('connection').dataset.state = 'unavailable';
      element('connection').textContent = 'Não foi possível carregar o acompanhamento. Tente recarregar a página.';
    }
  }, 10000);

  source.addEventListener('order', event => {
    hasConnected = true;
    clearTimeout(initialConnectionTimeout);
    try {
      const order = JSON.parse(event.data);
      element('connection').textContent = 'Atualização automática conectada';
      element('connection').dataset.state = 'connected';
      element('order').hidden = false;
      updateCompanyBranding(order);
      element('number').textContent = formatOrderNumber(order.order_number);
      element('device').textContent = [order.brand, order.model].filter(Boolean).join(' ') || 'Aparelho';
      element('customer').textContent = order.customer_name || '—';
      element('updated').textContent = date(order.updated_at);
      element('status-card').dataset.status = order.status;
      element('status').textContent = labels[order.status] || 'Em atendimento';
      element('details').replaceChildren();
      for (const [label, value] of [['Data de entrada', date(order.entry_date)], ...(order.expected_delivery_date ? [['Previsão de conclusão', date(order.expected_delivery_date)]] : [])]) {
        const dt = document.createElement('dt'); dt.textContent = label;
        const dd = document.createElement('dd'); dd.textContent = value || '—';
        const group = document.createElement('div'); group.append(dt, dd);
        element('details').append(group);
      }
      element('history').replaceChildren(...order.history.map((item, index) => {
        const li = document.createElement('li');
        const title = document.createElement('strong'); title.textContent = labels[item.status] || 'Em atendimento';
        const time = document.createElement('time'); time.textContent = date(item.created_at);
        li.append(title, time);
        if (index === order.history.length - 1) {
          li.setAttribute('aria-current', 'step');
          const badge = document.createElement('span'); badge.className = 'current-label'; badge.textContent = 'Status atual'; li.append(badge);
        }
        return li;
      }));
    } catch (parseErr) {
      console.error('[TRACKING] Falha ao processar dados da OS:', parseErr);
    }
  });

  source.addEventListener('unavailable', () => {
    hasConnected = true;
    clearTimeout(initialConnectionTimeout);
    source.close();
    element('order').hidden = true;
    element('connection').dataset.state = 'unavailable';
    element('connection').textContent = 'Este link não está mais disponível.';
  });

  source.onerror = () => {
    connectionFailedCount++;
    if (!hasConnected && connectionFailedCount >= 3) {
      source.close();
      element('connection').dataset.state = 'unavailable';
      element('connection').textContent = 'Acompanhamento não encontrado ou temporariamente indisponível.';
    } else if (hasConnected) {
      element('connection').dataset.state = 'connecting';
      element('connection').textContent = 'Conexão interrompida. Tentando reconectar…';
    }
  };

  window.addEventListener('pagehide', () => {
    clearTimeout(initialConnectionTimeout);
    source.close();
  });
}
