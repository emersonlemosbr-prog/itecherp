import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Store, User, Mail, Lock, Phone, CheckCircle2, XCircle, AlertCircle, ArrowRight, ShieldCheck, KeyRound } from 'lucide-react'
import api from '../api/client'
import itechCloudIcon from '../assets/itechcloud-icon.svg'

export default function RegisterStore() {
  const navigate = useNavigate()

  // Método de cadastro: 'email' ou 'google'
  const [authMethod, setAuthMethod] = useState('email')

  // Dados do formulário
  const [storeName, setStoreName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [erpPassword, setErpPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)

  // Integração Google
  const [googleId, setGoogleId] = useState(null)
  const [googleVerified, setGoogleVerified] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleInfoOpen, setGoogleInfoOpen] = useState(false)

  // Modal para confirmar senha de conta já existente para vincular conta Google
  const [linkModal, setLinkModal] = useState({
    isOpen: false,
    storeName: '',
    email: '',
    password: '',
    credential: '',
    loading: false,
    error: '',
  })

  // Estado de verificação de nickname
  const [nicknameStatus, setNicknameStatus] = useState({ checking: false, available: null, message: '' })

  // Estados de submissão
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '43080907809-1ddca943lpqqgbnivdlf3qa40h42u8kk.apps.googleusercontent.com'

  // Inicialização oficial do Google Identity Services (GSI)
  useEffect(() => {
    if (!googleClientId) return

    function initializeGsi() {
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          })

          const container = document.getElementById('gsiRegisterBtn')
          if (container) {
            container.innerHTML = ''
            window.google.accounts.id.renderButton(container, {
              theme: 'outline',
              size: 'large',
              text: 'continue_with',
              shape: 'rectangular',
              width: 260,
              locale: 'pt-BR',
            })
          }
        } catch (err) {
          console.error('[GSI_INIT_ERROR]', err)
        }
      }
    }

    if (window.google?.accounts?.id) {
      initializeGsi()
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval)
          initializeGsi()
        }
      }, 300)
      return () => clearInterval(interval)
    }
  }, [googleClientId])

  // Verificação de disponibilidade de nickname com debounce e retry sob demanda
  const checkNicknameAvailability = useCallback(async (targetNickname) => {
    const raw = targetNickname !== undefined ? targetNickname : nickname
    const trimmed = String(raw || '').trim().toLowerCase()
    if (!trimmed) {
      setNicknameStatus({ checking: false, available: null, message: '' })
      return
    }

    if (trimmed.length < 3) {
      setNicknameStatus({ checking: false, available: false, message: 'Mínimo de 3 caracteres.' })
      return
    }

    if (!/^[a-z0-9_.-]+$/.test(trimmed)) {
      setNicknameStatus({ checking: false, available: false, message: 'Use apenas letras, números, ponto ou traço.' })
      return
    }

    setNicknameStatus({ checking: true, available: null, message: 'Verificando...' })
    try {
      const { data } = await api.get(`/auth/check-nickname?nickname=${encodeURIComponent(trimmed)}`)
      setNicknameStatus({
        checking: false,
        available: data.available,
        message: data.available ? 'Nickname disponível!' : (data.error || 'Nickname já está em uso.')
      })
    } catch (err) {
      console.warn('[CHECK_NICKNAME_WARN]', err?.message)
      setNicknameStatus({
        checking: false,
        available: null,
        message: 'Não foi possível verificar a disponibilidade no momento.'
      })
    }
  }, [nickname])

  useEffect(() => {
    const trimmed = nickname.trim().toLowerCase()
    if (!trimmed) {
      setNicknameStatus({ checking: false, available: null, message: '' })
      return
    }

    if (trimmed.length < 3) {
      setNicknameStatus({ checking: false, available: false, message: 'Mínimo de 3 caracteres.' })
      return
    }

    if (!/^[a-z0-9_.-]+$/.test(trimmed)) {
      setNicknameStatus({ checking: false, available: false, message: 'Use apenas letras, números, ponto ou traço.' })
      return
    }

    setNicknameStatus({ checking: true, available: null, message: 'Verificando...' })
    const timer = setTimeout(() => {
      checkNicknameAvailability(trimmed)
    }, 450)

    return () => clearTimeout(timer)
  }, [nickname, checkNicknameAvailability])

  // Processa a resposta oficial com o token JWT retornado pelo Google Identity Services
  async function handleGoogleCredentialResponse(response) {
    const credential = response.credential
    if (!credential) {
      setError('Credencial do Google não recebida. Tente novamente.')
      return
    }

    setGoogleLoading(true)
    setError('')

    try {
      const { data } = await api.post('/auth/google', { credential })

      // Cenário 1: Usuário já possui loja vinculada -> Logar e redirecionar
      if (data.status === 'authenticated') {
        localStorage.setItem('itech_token', data.token)
        localStorage.setItem('itech_user', JSON.stringify(data.user))

        if (data.store?.status === 'pending_activation') {
          navigate('/aguardando-ativacao')
        } else if (data.store?.status === 'suspended') {
          navigate('/loja-suspensa')
        } else {
          navigate('/')
        }
        return
      }

      // Cenário 2: Conta já existe por e-mail e senha -> Requerer confirmação de propriedade
      if (data.status === 'needs_link_confirmation') {
        setLinkModal({
          isOpen: true,
          storeName: data.store_name,
          email: data.email,
          password: '',
          credential,
          loading: false,
          error: '',
        })
        return
      }

      // Cenário 3: Novo usuário -> Preencher dados verificados no formulário
      if (data.status === 'new_store') {
        setGoogleId(data.googleData.googleId)
        setGoogleVerified(true)
        if (data.googleData.name && !ownerName) {
          setOwnerName(data.googleData.name)
        }
        if (data.googleData.email) {
          setEmail(data.googleData.email)
        }
        setAuthMethod('email') // Abre o formulário de finalização
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Falha ao autenticar com o Google.'
      setError(errMsg)
    } finally {
      setGoogleLoading(false)
    }
  }

  // Ação ao clicar no botão Google
  function handleGoogleClick() {
    if (!googleClientId) {
      setGoogleInfoOpen(true)
      return
    }

    // Se a biblioteca GSI estiver disponível, dispara o prompt nativo
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Se o prompt One Tap não pôde ser exibido (ex: bloqueador), aciona o botão renderizado
          const btn = document.querySelector('#gsiRegisterBtn div[role="button"]')
          if (btn) btn.click()
        }
      })
    } else {
      setGoogleInfoOpen(true)
    }
  }

  // Confirmação segura de vinculação de conta Google com senha existente
  async function handleConfirmLink(e) {
    e.preventDefault()
    if (!linkModal.password) {
      setLinkModal(prev => ({ ...prev, error: 'Por favor, digite a senha da sua loja.' }))
      return
    }

    setLinkModal(prev => ({ ...prev, loading: true, error: '' }))
    try {
      const { data } = await api.post('/auth/google', {
        credential: linkModal.credential,
        linkPassword: linkModal.password,
      })

      if (data.status === 'authenticated' && data.token) {
        localStorage.setItem('itech_token', data.token)
        localStorage.setItem('itech_user', JSON.stringify(data.user))
        setLinkModal(prev => ({ ...prev, isOpen: false }))

        if (data.store?.status === 'pending_activation') {
          navigate('/aguardando-ativacao')
        } else if (data.store?.status === 'suspended') {
          navigate('/loja-suspensa')
        } else {
          navigate('/')
        }
      }
    } catch (err) {
      setLinkModal(prev => ({
        ...prev,
        loading: false,
        error: err.response?.data?.error || 'Senha incorreta. Não foi possível vincular a conta.',
      }))
    }
  }

  // Cancelar vínculo e voltar ao formulário comum
  function handleCancelGoogle() {
    setGoogleId(null)
    setGoogleVerified(false)
  }

  // Submissão do cadastro da loja
  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (nicknameStatus.available === false) {
      setError('Por favor, escolha um nickname válido e disponível.')
      return
    }

    if (erpPassword.length < 6) {
      setError('A senha do ERP deve ter pelo menos 6 caracteres.')
      return
    }

    if (erpPassword !== confirmPassword) {
      setError('A confirmação de senha do ERP não confere.')
      return
    }

    if (!acceptPrivacy) {
      setError('Você precisa ler e aceitar a Política de Privacidade (LGPD) para prosseguir.')
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/auth/register-store', {
        store_name: storeName,
        owner_name: ownerName,
        email,
        phone,
        owner_password: ownerPassword || erpPassword,
        nickname: nickname.trim().toLowerCase(),
        erp_password: erpPassword,
        googleId: googleId || null,
      })

      // Armazenar dados provisórios para a tela de confirmação
      sessionStorage.setItem('itech_registered_store', JSON.stringify({
        storeName: response.data.store.name,
        email: response.data.store.email,
        ownerName: response.data.store.owner_name,
        nickname: response.data.user.username,
      }))

      navigate('/aguardando-ativacao')
    } catch (err) {
      console.error('[REGISTER_STORE_ERROR]', {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
      })
      let msg = err.response?.data?.error || err.response?.data?.message
      if (!msg) {
        if (err.message === 'Network Error' || err.code === 'ERR_NETWORK') {
          msg = 'Não foi possível conectar ao servidor. Verifique a conexão com a internet ou tente novamente em instantes.'
        } else if (err.response?.status === 409) {
          msg = 'Já existe uma loja com este e-mail ou nickname cadastrado.'
        } else if (err.response?.status === 404) {
          msg = 'Endpoint de cadastro não encontrado (404). Verifique a URL da API.'
        } else {
          msg = err.message || 'Erro ao realizar cadastro da loja. Tente novamente.'
        }
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-4 sm:p-6 py-10 relative overflow-hidden font-['Inter',sans-serif]">
      {/* Glow de fundo inspirado na Landing Page */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[550px] rounded-full blur-3xl opacity-35"
        style={{ background: 'radial-gradient(circle, rgba(255, 190, 11, 0.15) 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 right-10 w-[600px] h-[450px] rounded-full blur-3xl opacity-20"
        style={{ background: 'radial-gradient(circle, rgba(255, 190, 11, 0.12) 0%, transparent 70%)' }}
      />

      <div className="w-full max-w-xl relative z-10">
        {/* Cabeçalho */}
        <div className="flex flex-col items-center mb-6 text-center text-white">
          <Link to="/" className="inline-block transition-transform hover:scale-105 mb-3" title="iTechCloud">
            <img
              src={itechCloudIcon}
              alt="iTechCloud"
              className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-[0_8px_24px_rgba(255,190,11,0.25)] rounded-2xl"
            />
          </Link>
          <h1 className="font-['Sora',sans-serif] font-extrabold text-2xl sm:text-3xl tracking-tight text-white">
            Criar Conta no iTech<span className="text-[#FFBE0B]">Cloud</span>
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-2 max-w-md">
            Cadastre sua assistência técnica e gerencie clientes, ordens de serviço, vendas e estoque em uma plataforma completa.
          </p>
        </div>

        {/* Modal de vinculação segura de conta Google existente */}
        {linkModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md bg-[#111111] border border-white/[0.08] rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 border-b border-white/[0.06] pb-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFBE0B]/10 border border-[#FFBE0B]/20 flex items-center justify-center text-[#FFBE0B]">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 className="font-['Sora',sans-serif] font-bold text-white text-base">Confirmar Propriedade da Conta</h3>
                  <p className="text-xs text-gray-400">Loja: {linkModal.storeName}</p>
                </div>
              </div>

              <p className="text-xs text-gray-300 leading-relaxed">
                Já existe uma loja registrada com o e-mail <strong>{linkModal.email}</strong>. Por segurança, digite sua senha de acesso ao ERP para vincular sua conta Google.
              </p>

              {linkModal.error && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-rose-400" />
                  <span>{linkModal.error}</span>
                </div>
              )}

              <form onSubmit={handleConfirmLink} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 tracking-wide">Senha da Loja</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="password"
                      required
                      autoFocus
                      value={linkModal.password}
                      onChange={(e) => setLinkModal(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Sua senha atual"
                      className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FFBE0B] focus:ring-1 focus:ring-[#FFBE0B] transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setLinkModal(prev => ({ ...prev, isOpen: false }))}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={linkModal.loading}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-[#FFBE0B] hover:bg-[#f5b400] text-[#0a0a0a] text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {linkModal.loading ? 'Confirmando...' : 'Vincular e Entrar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal/Aviso de Configuração Google */}
        {googleInfoOpen && (
          <div className="mb-6 p-4 rounded-xl border border-[#FFBE0B]/30 bg-[#FFBE0B]/10 text-amber-200 text-sm space-y-2">
            <div className="flex items-center gap-2 font-semibold text-[#FFBE0B]">
              <AlertCircle size={18} />
              Integração com Google Pronta para Ativação
            </div>
            <p className="text-xs text-amber-200/90 leading-relaxed">
              O fluxo oficial Google Identity Services está pronto no sistema. Para habilitar o login direto com o Google neste ambiente, configure a variável <code className="bg-amber-900/60 px-1 py-0.5 rounded font-mono">VITE_GOOGLE_CLIENT_ID</code> no arquivo <code className="bg-amber-900/60 px-1 py-0.5 rounded font-mono">frontend/.env</code> e <code className="bg-amber-900/60 px-1 py-0.5 rounded font-mono">GOOGLE_CLIENT_ID</code> no <code className="bg-amber-900/60 px-1 py-0.5 rounded font-mono">backend/.env</code>.
            </p>
            <p className="text-xs text-amber-300 font-medium">
              Enquanto isso, você pode criar e acessar sua conta normalmente pela opção de <strong>E-mail e Senha</strong> abaixo.
            </p>
            <button
              type="button"
              onClick={() => setGoogleInfoOpen(false)}
              className="text-xs underline text-[#FFBE0B] hover:text-[#f5b400] pt-1 cursor-pointer"
            >
              Entendido, fechar aviso
            </button>
          </div>
        )}

        {/* Card Principal */}
        <div className="bg-[#111111] border border-white/[0.08] hover:border-[#FFBE0B]/30 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/80 space-y-6 transition-all duration-200">

          {/* Banner de Conta Google Verificada */}
          {googleVerified && (
            <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-center justify-between text-xs text-emerald-200 animate-fadeIn">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span>
                  Autenticado com a Conta Google: <strong>{email}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelGoogle}
                className="text-[11px] underline text-emerald-400 hover:text-emerald-300 ml-2 cursor-pointer"
              >
                Trocar conta
              </button>
            </div>
          )}

          {/* Alternância de Métodos de Cadastro */}
          {!googleVerified && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 p-1.5 bg-[#1a1a1a] rounded-xl border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setAuthMethod('email')}
                  className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    authMethod === 'email'
                      ? 'bg-[#FFBE0B] text-[#0a0a0a] shadow-md shadow-[#FFBE0B]/20 font-bold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Mail size={16} />
                  E-mail e Senha
                </button>
                <button
                  type="button"
                  onClick={handleGoogleClick}
                  disabled={googleLoading}
                  className="py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all bg-white hover:bg-gray-100 text-gray-900 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {googleLoading ? (
                    <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                  )}
                  Google
                </button>
              </div>

              {/* Contêiner invisível/oficial para o Google Identity Services renderizar */}
              <div id="gsiRegisterBtn" className="hidden" />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-xl p-3.5 animate-fadeIn">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-400" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Bloco 1: Dados da Loja e Proprietário */}
            <div className="space-y-4">
              <div className="border-b border-white/[0.06] pb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <Store size={14} className="text-[#FFBE0B]" />
                  1. Dados da Sua Empresa
                </span>
                {googleVerified && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                    Google Vinculado
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 tracking-wide">Nome da Loja *</label>
                  <input
                    type="text"
                    required
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Ex: TechFix Assistência"
                    className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FFBE0B] focus:ring-1 focus:ring-[#FFBE0B] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 tracking-wide">Nome do Proprietário *</label>
                  <input
                    type="text"
                    required
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Seu nome completo"
                    className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FFBE0B] focus:ring-1 focus:ring-[#FFBE0B] transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 tracking-wide">
                    E-mail Principal *
                    {googleVerified && (
                      <span className="ml-1 text-[10px] text-emerald-400 font-semibold">(Verificado pelo Google)</span>
                    )}
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="email"
                      required
                      readOnly={googleVerified}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="proprietario@email.com"
                      className={`w-full border rounded-xl pl-10 pr-3.5 py-2.5 text-sm transition-all ${
                        googleVerified
                          ? 'bg-[#1a1a1a] border-emerald-500/40 text-emerald-300 cursor-not-allowed'
                          : 'bg-[#1a1a1a] border-white/[0.08] text-white placeholder-gray-500 focus:outline-none focus:border-[#FFBE0B] focus:ring-1 focus:ring-[#FFBE0B]'
                      }`}
                    />
                  </div>
                  <span className="text-[11px] text-gray-400 mt-1 block">Usado para identificação e recuperação de acesso.</span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 tracking-wide">WhatsApp / Telefone *</label>
                  <div className="relative">
                    <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FFBE0B] focus:ring-1 focus:ring-[#FFBE0B] transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bloco 2: Acesso Operacional ao ERP */}
            <div className="space-y-4 pt-2">
              <div className="border-b border-white/[0.06] pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-[#FFBE0B]" />
                  2. Acesso Operacional ao ERP
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 tracking-wide">
                  Nickname de Acesso (Login no Sistema) *
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    required
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Ex: joao.techfix"
                    className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FFBE0B] focus:ring-1 focus:ring-[#FFBE0B] transition-all"
                  />
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    {nicknameStatus.checking && (
                      <div className="w-4 h-4 border-2 border-[#FFBE0B] border-t-transparent rounded-full animate-spin" />
                    )}
                    {!nicknameStatus.checking && nicknameStatus.available === true && (
                      <CheckCircle2 size={16} className="text-emerald-400" />
                    )}
                    {!nicknameStatus.checking && nicknameStatus.available === false && (
                      <XCircle size={16} className="text-rose-400" />
                    )}
                  </div>
                </div>
                {nicknameStatus.message && (
                  <div className="flex items-center justify-between mt-1">
                    <p className={`text-[11px] font-medium ${
                      nicknameStatus.available ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {nicknameStatus.message}
                    </p>
                    {nicknameStatus.available === null && !nicknameStatus.checking && nickname.trim().length >= 3 && (
                      <button
                        type="button"
                        onClick={() => checkNicknameAvailability(nickname)}
                        className="text-[11px] text-[#FFBE0B] hover:text-[#f5b400] underline font-medium cursor-pointer ml-2"
                      >
                        Tentar novamente
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 tracking-wide">Senha do ERP *</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="password"
                      required
                      value={erpPassword}
                      onChange={(e) => setErpPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FFBE0B] focus:ring-1 focus:ring-[#FFBE0B] transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 tracking-wide">Confirmar Senha *</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a senha"
                      className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FFBE0B] focus:ring-1 focus:ring-[#FFBE0B] transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Termos de Privacidade e Consentimento LGPD */}
            <div className="pt-2">
              <label className="flex items-start gap-3 p-3 rounded-xl bg-[#1a1a1a] border border-white/[0.06] hover:border-white/[0.12] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  required
                  checked={acceptPrivacy}
                  onChange={(e) => setAcceptPrivacy(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/[0.2] bg-[#111111] text-[#FFBE0B] focus:ring-[#FFBE0B]/30 shrink-0 cursor-pointer accent-[#FFBE0B]"
                />
                <span className="text-xs text-gray-300 leading-snug">
                  Li e concordo com a{' '}
                  <Link
                    to="/politica-privacidade"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#FFBE0B] hover:text-[#f5b400] underline font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Política de Privacidade (LGPD)
                  </Link>
                  {' '}do iTech ERP, autorizando o tratamento técnico dos dados cadastrais necessários à operação da plataforma.
                </span>
              </label>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading || !acceptPrivacy || nicknameStatus.checking || nicknameStatus.available === false}
                className="w-full py-3 px-4 rounded-xl bg-[#FFBE0B] hover:bg-[#f5b400] text-[#0a0a0a] font-bold text-sm tracking-wide shadow-lg shadow-[#FFBE0B]/20 flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
                    Criando sua Loja...
                  </>
                ) : (
                  <>
                    Concluir Cadastro
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Links no Rodapé */}
          <div className="pt-4 border-t border-white/[0.06] text-center text-xs text-gray-400 space-y-2">
            <p>
              Já possui uma loja cadastrada?{' '}
              <Link to="/login" className="text-[#FFBE0B] hover:text-[#f5b400] font-semibold transition-colors">
                Fazer login no iTech ERP
              </Link>
            </p>
            <p>
              Esqueceu sua senha?{' '}
              <Link to="/recuperar-senha" className="text-gray-400 hover:text-gray-200 underline transition-colors">
                Recuperar acesso
              </Link>
            </p>
            <div className="pt-2 text-[11px] text-gray-500">
              <Link to="/politica-privacidade" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 underline">
                Política de Privacidade e Proteção de Dados (LGPD)
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
