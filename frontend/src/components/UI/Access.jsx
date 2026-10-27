import React from 'react'
import { useAuth } from '../../context/AuthContext'
export default function Access({ permission, children }) {
  const { user, isAdmin } = useAuth()
  return isAdmin || (permission && user?.permissions?.[permission]) ? children : null
}
