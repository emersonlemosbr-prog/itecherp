(async () => {
  const button = document.getElementById('enable-push');
  const message = document.getElementById('push-message');
  const token = location.pathname.split('/')[2];
  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = `/acompanhamento/${encodeURIComponent(token)}/manifest.webmanifest`;
  document.head.append(manifest);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !standalone) {
    message.textContent = 'No iPhone/iPad (iOS 16.4 ou superior), abra no Safari, toque em Compartilhar → Adicionar à Tela de Início. Abra pelo ícone criado e ative as notificações.';
    return;
  }
  if (!isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    message.textContent = 'Este navegador não oferece notificações push. Abra este link HTTPS em um navegador compatível.';
    return;
  }
  // Converte a chave pública Base64 URL-safe para o formato exigido pela Push API.
  function applicationKey(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(base64 + '='.repeat((4 - base64.length % 4) % 4)), c => c.charCodeAt(0));
  }
  try {
    const response = await fetch('/api/public/push-key');
    if (!response.ok) throw Error('Não foi possível preparar as notificações. Recarregue a página.');
    const { publicKey } = await response.json();
    if (!publicKey) { message.textContent = 'Notificações ainda não disponíveis. Você pode acompanhar o status nesta página.'; return; }
    await navigator.serviceWorker.register('/sw.js', { scope: '/acompanhamento/' });
    const registration = await navigator.serviceWorker.ready;
    button.disabled = false;
    message.textContent = 'Receba atualizações desta OS mesmo com a aba fechada.';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        // Pedir permissão diretamente no clique preserva o gesto exigido no Safari.
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw Error(permission === 'denied'
          ? 'Notificações bloqueadas. Libere a permissão nas configurações do navegador e tente novamente.'
          : 'Permissão não concedida. Toque no botão quando desejar ativar.');
        const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: applicationKey(publicKey),
        });
        // A permissão é por domínio; a associação no servidor é específica desta OS.
        const saved = await fetch(`/api/public/service-order/${encodeURIComponent(token)}/subscriptions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription),
        });
        if (!saved.ok) {
          const error = await saved.json().catch(() => ({}));
          throw Error(error.error || 'Não foi possível salvar. Tente novamente.');
        }
        button.textContent = 'Notificações ativadas para esta OS';
        message.textContent = 'Pronto! Você receberá os próximos avisos de alteração de status.';
      } catch (error) { message.textContent = error.message; button.disabled = false; }
    });
  } catch (error) { message.textContent = error.message; }
})();
