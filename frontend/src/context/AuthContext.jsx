import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('itech_user')
    return raw ? JSON.parse(raw) : null
  })

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password })
    localStorage.setItem('itech_token', data.token)
    localStorage.setItem('itech_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('itech_token')
    localStorage.removeItem('itech_user')
    setUser(null)
  }, [])

  useEffect(() => { if (user) api.get('/auth/me').then(({ data }) => { setUser(data.user); localStorage.setItem('itech_user', JSON.stringify(data.user)) }).catch(() => logout()) }, [])

  const isAdmin = user?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
