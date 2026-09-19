import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { can } from '@/auth/permissions'
import { AddIcon, BinderIcon, PeopleIcon } from './Icons'

const iconUrl = `${import.meta.env.BASE_URL}icons/icon.svg`

export function Layout({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth()
  const links = [
    { to: '/', label: 'Binder', icon: <BinderIcon />, show: true },
    { to: '/add', label: 'Add cards', icon: <AddIcon />, show: can(role, 'card:create') },
    { to: '/people', label: 'People', icon: <PeopleIcon />, show: can(role, 'users:manage') },
  ].filter((l) => l.show)

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src={iconUrl} alt="" />
          Card Binder
        </NavLink>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'}>{l.label}</NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <div className="who">
          {profile?.avatar_url ? <img className="avatar" src={profile.avatar_url} alt="" referrerPolicy="no-referrer" /> : <span className="avatar" />}
          <span className="small hide-narrow">{profile?.display_name ?? profile?.email}</span>
          <button className="btn ghost" onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>
      <main className="main">{children}</main>
      <nav className="tabbar">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === '/'}>
            {l.icon}
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
