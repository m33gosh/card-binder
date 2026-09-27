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
import { SquishListPage } from './pages/squishes/SquishListPage'
import { SquishFormPage } from './pages/squishes/SquishFormPage'
import { SquishDetailPage } from './pages/squishes/SquishDetailPage'

function Require({ action, children }: { action: Action; children: React.ReactElement }) {
  const { role } = useAuth()
  return can(role, action) ? children : <Navigate to="/" replace />
}

export default function App() {
  const { loading, user, role, profile } = useAuth()
  const squishes = profile?.collection === 'squishes'

  if (!supabaseConfigured) return <SetupPage />
  if (loading) return <Spinner />
  if (!user) return <LoginPage />
  if (!can(role, 'collection:view')) return <PendingPage />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={squishes ? <Navigate to="/squishes" replace /> : <CollectionPage />} />
        <Route path="/cards/:id" element={<CardDetailPage />} />
        <Route path="/add" element={<Require action="card:create"><AddCardsPage /></Require>} />
        <Route path="/squishes" element={<SquishListPage />} />
        <Route path="/squishes/new" element={<Require action="card:create"><SquishFormPage /></Require>} />
        <Route path="/squishes/:id" element={<SquishDetailPage />} />
        <Route path="/squishes/:id/edit" element={<Require action="card:edit"><SquishFormPage /></Require>} />
        <Route path="/people" element={<Require action="users:manage"><PeoplePage /></Require>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
