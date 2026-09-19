import { describe, expect, it } from 'vitest'
import { can, canEditCard } from './permissions'

describe('can', () => {
  it('blocks pending users from everything', () => {
    expect(can('pending', 'collection:view')).toBe(false)
  })
  it('lets viewers look but not add', () => {
    expect(can('viewer', 'collection:view')).toBe(true)
    expect(can('viewer', 'card:create')).toBe(false)
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
