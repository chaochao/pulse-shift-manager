import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChatApp } from './ChatApp'
import { PulseApp } from '@/pulse/PulseApp'
import { CalendarPage } from '@/pulse/pages/CalendarPage'
import { AnalyticsPage } from '@/pulse/pages/AnalyticsPage'
import { PatientsPage } from '@/pulse/pages/PatientsPage'
import { StaffPage } from '@/pulse/pages/StaffPage'
import { StaffDetailPage } from '@/pulse/pages/StaffDetailPage'
import { SettingsPage } from '@/pulse/pages/SettingsPage'
import { QAPage } from '@/pulse/pages/QAPage'
import { Toaster } from 'sonner'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } }
})

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Toaster position="bottom-right" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ChatApp />} />
          <Route path="/pulse" element={<PulseApp />}>
            <Route index element={<CalendarPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="patients" element={<PatientsPage />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="staff/:id" element={<StaffDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="qa" element={<QAPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
