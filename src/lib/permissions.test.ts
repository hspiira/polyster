import { describe, expect, it } from 'vitest'
import { hasPermission, ROLE_DEFAULT_PERMISSIONS } from './permissions'
import { PERMISSION_KEYS } from '../db/schema'

describe('hasPermission', () => {
  it('allows everything when no staff is picked', () => {
    for (const key of PERMISSION_KEYS) expect(hasPermission(null, key)).toBe(true)
  })

  it('gives the owner every permission', () => {
    for (const key of PERMISSION_KEYS) {
      expect(hasPermission({ role: 'owner', permission_overrides: undefined }, key)).toBe(true)
    }
  })

  it('reserves payments.refund from a manager by default, but grants the rest', () => {
    const manager = { role: 'manager' as const, permission_overrides: undefined }
    expect(hasPermission(manager, 'payments.refund')).toBe(false)
    expect(hasPermission(manager, 'orders.edit')).toBe(true)
    expect(hasPermission(manager, 'production.manage')).toBe(true)
  })

  it('limits staff to day-to-day actions by default', () => {
    const staff = { role: 'staff' as const, permission_overrides: undefined }
    expect(hasPermission(staff, 'orders.create')).toBe(true)
    expect(hasPermission(staff, 'payments.create')).toBe(true)
    expect(hasPermission(staff, 'reports.view')).toBe(true)
    expect(hasPermission(staff, 'inventory.view')).toBe(true)
    expect(hasPermission(staff, 'orders.edit')).toBe(false)
    expect(hasPermission(staff, 'payments.refund')).toBe(false)
    expect(hasPermission(staff, 'inventory.adjust')).toBe(false)
    expect(hasPermission(staff, 'production.manage')).toBe(false)
    expect(hasPermission(staff, 'expenses.create')).toBe(false)
  })

  it('lets a per-person override win over the role default, in either direction', () => {
    const restrictedManager = {
      role: 'manager' as const,
      permission_overrides: { 'orders.edit': false },
    }
    expect(hasPermission(restrictedManager, 'orders.edit')).toBe(false)
    expect(hasPermission(restrictedManager, 'production.manage')).toBe(true)

    const trustedStaff = {
      role: 'staff' as const,
      permission_overrides: { 'expenses.create': true },
    }
    expect(hasPermission(trustedStaff, 'expenses.create')).toBe(true)
    expect(hasPermission(trustedStaff, 'orders.edit')).toBe(false)
  })

  it('defines a default for every permission key, for every role', () => {
    for (const role of Object.keys(ROLE_DEFAULT_PERMISSIONS) as (keyof typeof ROLE_DEFAULT_PERMISSIONS)[]) {
      for (const key of PERMISSION_KEYS) {
        expect(typeof ROLE_DEFAULT_PERMISSIONS[role][key]).toBe('boolean')
      }
    }
  })
})
