import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' })

export function getApiBaseUrl() {
  const base = api.defaults.baseURL || '/api'
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
  // Se o chamador já definiu o header Authorization (ex: rotas do admin da plataforma), preservar
  if (config.headers?.Authorization) {
    return config
  }

  // Para rotas da plataforma, priorizar itech_platform_token
  const isPlatform = config.url && (config.url.startsWith('/platform') || config.url.startsWith('platform'))
  const token = isPlatform
    ? (localStorage.getItem('itech_platform_token') || localStorage.getItem('itech_token'))
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
      localStorage.removeItem('itech_token')
      localStorage.removeItem('itech_user')
      if (!window.location.pathname.startsWith('/login') &&
          !window.location.pathname.startsWith('/cadastro') &&
          !window.location.pathname.startsWith('/recuperar-senha') &&
          !window.location.pathname.startsWith('/admin-plataforma')) {
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
