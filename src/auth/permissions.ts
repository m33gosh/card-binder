// Mirrors the database policies in supabase/migrations/0001_init.sql.
// The UI uses this to show/hide actions; Postgres row security is what
// actually enforces it, so a bug here can't leak or corrupt data.

export type Role = 'pending' | 'editor' | 'admin'

export const ROLES: Role[] = ['pending', 'editor', 'admin']

export const ROLE_LABELS: Record<Role, string> = {
  pending: 'Waiting for approval',
  editor: 'Has a binder',
  admin: 'Runs the app',
}

export type Action =
  | 'collection:view'
  | 'card:create'
  | 'card:edit'
  | 'card:delete'
  | 'prices:refresh'
  | 'users:manage'

const RANK: Record<Role, number> = { pending: 0, editor: 2, admin: 3 }

const MIN_ROLE: Record<Action, Role> = {
  'collection:view': 'editor',
  'card:create': 'editor',
  'card:edit': 'editor',
  'card:delete': 'editor',
  'prices:refresh': 'editor',
  'users:manage': 'admin',
}

export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false
  // an unknown role (e.g. the retired 'viewer') gets nothing
  return (RANK[role] ?? 0) >= RANK[MIN_ROLE[action]]
}

/** Every binder is private: only its owner can change it, admins included. */
export function canEditCard(role: Role | null | undefined, userId: string | undefined, ownerId: string): boolean {
  return can(role, 'card:edit') && userId === ownerId
}
