import { describe, expect, it } from 'vitest'
import { can, canEditCard } from './permissions'

describe('can', () => {
  it('blocks pending users from everything', () => {
    expect(can('pending', 'collection:view')).toBe(false)
  })
  it('editors have a binder they can fill', () => {
    expect(can('editor', 'collection:view')).toBe(true)
    expect(can('editor', 'card:create')).toBe(true)
  })
  it('treats a retired or unknown role as no access', () => {
    expect(can('viewer' as never, 'collection:view')).toBe(false)
  })
  it('only admins manage users', () => {
    expect(can('editor', 'users:manage')).toBe(false)
    expect(can('admin', 'users:manage')).toBe(true)
  })
})

describe('canEditCard', () => {
  it('editors edit only their own cards', () => {
    expect(canEditCard('editor', 'u1', 'u1')).toBe(true)
    expect(canEditCard('editor', 'u1', 'u2')).toBe(false)
  })
  it('admins edit only their own binder too', () => {
    expect(canEditCard('admin', 'u1', 'u2')).toBe(false)
    expect(canEditCard('admin', 'u1', 'u1')).toBe(true)
  })
})
