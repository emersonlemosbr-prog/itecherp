import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('itech_user')
    return raw ? JSON.parse(raw) : null
  })

  const [store, setStore] = useState(() => {
    const raw = localStorage.getItem('itech_store')
    return raw ? JSON.parse(raw) : null
  })

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password })
    localStorage.setItem('itech_token', data.token)
    localStorage.setItem('itech_user', JSON.stringify(data.user))
    setUser(data.user)

    if (data.store) {
      localStorage.setItem('itech_store', JSON.stringify(data.store))
      setStore(data.store)
    }

    // Limpa a flag de visualização do modal para exibir no novo login caso suspenso
    sessionStorage.removeItem('itech_suspension_modal_viewed')

    return data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('itech_token')
    localStorage.removeItem('itech_user')
    localStorage.removeItem('itech_store')
    sessionStorage.removeItem('itech_suspension_modal_viewed')
    setUser(null)
    setStore(null)
  }, [])

  useEffect(() => {
    if (user) {
      api.get('/auth/me')
        .then(({ data }) => {
          setUser(data.user)
          localStorage.setItem('itech_user', JSON.stringify(data.user))
          if (data.store) {
            setStore(data.store)
            localStorage.setItem('itech_store', JSON.stringify(data.store))
          }
        })
        .catch(() => logout())
    }
  }, [])

  const isAdmin = user?.role === 'admin'
  const isSuspended = store?.status === 'suspended' || store?.is_suspended || false
  const suspensionReason = store?.suspension_reason || 'Acesso temporariamente limitado por pendência administrativa.'

  return (
    <AuthContext.Provider value={{
      user,
      store,
      setStore,
      login,
      logout,
      isAdmin,
      isSuspended,
      suspensionReason
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
