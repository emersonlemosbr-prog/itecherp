import React, { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const THEME_KEY = 'itech_theme'

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved === 'dark' || saved === 'light') {
        return saved === 'dark'
      }
    } catch (error) {
      console.warn('Não foi possível ler o tema salvo:', error)
    }

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'

    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
    } catch (error) {
      console.warn('Não foi possível salvar o tema:', error)
    }
  }, [dark])

  return (
    <ThemeContext.Provider value={{
      dark,
      setDark,
      toggle: () => setDark(current => !current),
      setLight: () => setDark(false),
      setDarkTheme: () => setDark(true),
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
