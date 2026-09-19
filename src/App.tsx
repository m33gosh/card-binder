import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { can, type Action } from './auth/permissions'
import { supabaseConfigured } from './lib/supabase'
import { Layout } from './components/Layout'
import { Spinner } from './components/Spinner'
import { LoginPage } from './pages/LoginPage'
import { PendingPage } from './pages/PendingPage'
import { CollectionPage } from './pages/CollectionPage'
import { CardDetailPage } from './pages/CardDetailPage'
import { AddCardsPage } from './pages/AddCardsPage'
import { PeoplePage } from './pages/PeoplePage'
import { SetupPage } from './pages/SetupPage'

function Require({ action, children }: { action: Action; children: React.ReactElement }) {
  const { role } = useAuth()
  return can(role, action) ? children : <Navigate to="/" replace />
}

export default function App() {
  const { loading, user, role } = useAuth()

  if (!supabaseConfigured) return <SetupPage />
  if (loading) return <Spinner />
  if (!user) return <LoginPage />
  if (!can(role, 'collection:view')) return <PendingPage />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<CollectionPage />} />
        <Route path="/cards/:id" element={<CardDetailPage />} />
        <Route path="/add" element={<Require action="card:create"><AddCardsPage /></Require>} />
        <Route path="/people" element={<Require action="users:manage"><PeoplePage /></Require>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
