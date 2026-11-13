import axios from 'axios'

/**
 * Resolve a URL-base da API com resiliência para todos os ambientes:
 * 1. Quando o frontend e o backend estão na mesma origem (Shard Cloud em erp.itechcelulareinformatica.com.br,
 *    domínio principal, localhost ou rede local LAN), utiliza '/api' relativo sobre o mesmo protocolo/porta (HTTPS).
 * 2. Em ambientes externos/separados (ex: Cloudflare Pages *.pages.dev), utiliza VITE_API_URL normalizada
 *    ou faz fallback para a URL oficial da API na Shard Cloud (https://erp.itechcelulareinformatica.com.br/api).
 */
export const DEFAULT_API_URL = 'https://erp.itechcelulareinformatica.com.br/api'
export const DEFAULT_RENDER_API_URL = DEFAULT_API_URL

export function resolveApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname.toLowerCase()
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0'
    const isRender = hostname.endsWith('.onrender.com')
    const isShardCloud = hostname.endsWith('.shardweb.app') || hostname.endsWith('.shardcloud.app')

    // IPs privados locais (Wi-Fi/LAN para celulares ou computadores na mesma rede: 192.168.x.x, 10.x.x.x, 172.16-31.x.x, 26.x.x.x VPN)
    const isPrivateIp = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|26\.)/.test(hostname) || hostname.endsWith('.internal') || hostname.endsWith('.local')

    // Domínios oficiais em que frontend e backend são servidos na mesma origem
    const isSameOriginDomain =
      hostname === 'erp.itechcelulareinformatica.com.br' ||
      hostname === 'itechcelulareinformatica.com.br' ||
      hostname === 'www.itechcelulareinformatica.com.br' ||
      hostname === 'api.itechcelulareinformatica.com.br'

    // 1. Quando o frontend estiver rodando na mesma origem do backend:
    // Sempre utilizar '/api' relativo.
    if (isLocalhost || isRender || isShardCloud || isPrivateIp || isSameOriginDomain) {
      return '/api'
    }
  }

  // 2. Em ambientes remotos ou domínios separados (Cloudflare Pages, etc.):
  const envUrl = (import.meta.env.VITE_API_URL || '').trim()

  if (
    envUrl &&
    !envUrl.includes('itecherp-backend.onrender.com') &&
    !envUrl.includes('itech-project-z1ez.onrender.com') &&
    !envUrl.includes('api.itechcelulareinformatica.com.br')
  ) {
    const clean = envUrl.replace(/\/+$/, '')
    return clean.endsWith('/api') ? clean : `${clean}/api`
  }

  // 3. Fallback oficial ativo: Shard Cloud da iTech
  return DEFAULT_API_URL
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
      }
      // NOTA: 'STORE_SUSPENDED' não redireciona para fora do ERP; o usuário opera no modo de acesso restrito
    }
    return Promise.reject(err)
  }
)

export default api
