import { beforeEach, describe, expect, it } from 'vitest'
import { backTarget, ownerOf, recordVisit, resetVisits } from './navigation'

function visit(...paths: string[]) {
  for (const path of paths) recordVisit(path)
}

describe('ownerOf', () => {
  it('owns the money screens by the hub, not by their path', () => {
    expect(ownerOf('/sales')).toBe('/money')
    expect(ownerOf('/expenses')).toBe('/money')
    expect(ownerOf('/reports')).toBe('/money')
  })

  it('owns the settings screens by Settings', () => {
    expect(ownerOf('/inventory')).toBe('/settings')
    expect(ownerOf('/settings/staff')).toBe('/settings')
    expect(ownerOf('/settings')).toBe('/')
  })

  it('falls back to the path prefix', () => {
    expect(ownerOf('/orders/abc')).toBe('/orders')
    expect(ownerOf('/orders/abc/edit')).toBe('/orders/abc')
    expect(ownerOf('/sales/new')).toBe('/sales')
    expect(ownerOf('/reports/advanced')).toBe('/reports')
  })
})

describe('backTarget', () => {
  beforeEach(resetVisits)

  it('goes back to the hub you came from, not the one a screen was filed under', () => {
    visit('/', '/money', '/sales')
    expect(backTarget('/sales')).toBe('/money')

    resetVisits()
    visit('/', '/settings', '/expenses')
    expect(backTarget('/expenses')).toBe('/settings')
  })

  it('uses the owner on a cold deep link', () => {
    visit('/sales')
    expect(backTarget('/sales')).toBe('/money')

    resetVisits()
    visit('/orders/abc')
    expect(backTarget('/orders/abc')).toBe('/orders')
  })

  it('keeps the client you opened an order from', () => {
    visit('/clients', '/clients/abc', '/orders/xyz')
    expect(backTarget('/orders/xyz')).toBe('/clients/abc')
  })

  it('never sends you back into a task you just finished', () => {
    visit('/money', '/sales', '/sales/new', '/sales')
    expect(backTarget('/sales')).toBe('/money')

    resetVisits()
    visit('/orders', '/orders/abc', '/orders/abc/edit', '/orders/abc')
    expect(backTarget('/orders/abc')).toBe('/orders')
  })

  it('never goes back into something deeper than where you are', () => {
    visit('/orders', '/orders/abc', '/orders')
    expect(backTarget('/orders')).toBe('/')
  })

  it('takes the most recent parent, not the first ever visited', () => {
    visit('/settings', '/reports', '/money', '/reports')
    expect(backTarget('/reports')).toBe('/money')
  })

  it('falls back to the owner once the trail is longer than it keeps', () => {
    visit('/money')
    for (let i = 0; i < 12; i += 1) visit(`/clients/${i}`)
    expect(backTarget('/sales')).toBe('/clients/11')
  })
})
