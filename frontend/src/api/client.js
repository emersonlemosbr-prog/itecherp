import axios from 'axios'

/**
 * Resolve a URL-base da API com resiliência para todos os ambientes:
 * 1. Se VITE_API_URL estiver definida: normaliza garantindo que termine em /api (sem barras duplicadas).
 * 2. Se estiver em produção no Cloudflare Pages (*.pages.dev ou domínio customizado diferente do Render):
 *    utiliza como fallback a URL pública oficial do backend no Render (https://itecherp-backend.onrender.com/api).
 * 3. Se estiver acessando diretamente pelo Render (*.onrender.com) ou em desenvolvimento local (localhost/127.0.0.1):
 *    utiliza '/api' relativo (mesma origem ou proxy do Vite).
 */
export function resolveApiBaseUrl() {
  const envUrl = (import.meta.env.VITE_API_URL || '').trim()

  if (envUrl) {
    const clean = envUrl.replace(/\/+$/, '')
    return clean.endsWith('/api') ? clean : `${clean}/api`
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname.toLowerCase()
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0'
    const isRender = hostname.endsWith('.onrender.com')

    // Se estiver no Cloudflare Pages ou domínio externo sem backend local, apontar para o Render
    if (!isLocalhost && !isRender) {
      return 'https://itecherp-backend.onrender.com/api'
    }
  }

  return '/api'
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 30000,
})

export function getApiBaseUrl() {
  const base = api.defaults.baseURL || resolveApiBaseUrl()
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return base.replace(/\/api\/?$/, '')
  }
  return typeof window !== 'undefined' ? window.location.origin : ''
}

export function authenticatedFileUrl(url) {
  const token = localStorage.getItem('itech_token')
  if (!token || !url) return url
  const base = getApiBaseUrl()
  const fullUrl = url.startsWith('http') ? url : `${base}${url}`
  const separator = fullUrl.includes('?') ? '&' : '?'
  return `${fullUrl}${separator}token=${encodeURIComponent(token)}`
}

api.interceptors.request.use((config) => {
  // Se o chamador já definiu o header Authorization, preservar
  if (config.headers?.Authorization) {
    return config
  }

  // Para rotas da plataforma (/platform/*), utilizar estritamente o token do superadmin
  const urlPath = String(config.url || '')
  const isPlatform = urlPath.startsWith('/platform') || urlPath.startsWith('platform')
  const token = isPlatform
    ? localStorage.getItem('itech_platform_token')
    : localStorage.getItem('itech_token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Ignora erro 401 nas telas públicas e na área do superadmin
      if (!window.location.pathname.startsWith('/login') &&
          !window.location.pathname.startsWith('/cadastro') &&
          !window.location.pathname.startsWith('/recuperar-senha') &&
          !window.location.pathname.startsWith('/admin-plataforma')) {
        localStorage.removeItem('itech_token')
        localStorage.removeItem('itech_user')
        window.location.href = '/login'
      }
    } else if (err.response?.status === 403) {
      const code = err.response?.data?.code
      if (code === 'STORE_PENDING' && window.location.pathname !== '/aguardando-ativacao') {
        window.location.href = '/aguardando-ativacao'
      } else if (code === 'STORE_SUSPENDED' && window.location.pathname !== '/loja-suspensa') {
        window.location.href = '/loja-suspensa'
      }
    }
    return Promise.reject(err)
  }
)

export default api
