import React, { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import NotificationDrawer from '../Notifications/NotificationDrawer'
import NotificationPreferencesModal from '../Notifications/NotificationPreferencesModal'
import { useNotifications } from '../../context/NotificationContext'

export default function AppShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isPreferencesOpen, setIsPreferencesOpen } = useNotifications()

  return (
    <div className="admin-shell relative flex min-h-screen bg-slate-100 text-slate-900 transition-colors duration-300 dark:bg-[var(--bg-primary)] dark:text-[var(--text-main)]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 max-w-[1560px] w-full mx-auto min-w-0">
          {children}
        </main>
      </div>

      <NotificationDrawer />
      <NotificationPreferencesModal
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
      />
    </div>
  )
}
