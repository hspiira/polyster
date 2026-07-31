import { describe, expect, it } from 'vitest'
import { heroSegments } from './todayModel'
import { formatMoney } from '../../lib/money'

const NONE = { late: 0, dueToday: 0, dueThisWeek: 0, outstanding: 0 }

describe('heroSegments', () => {
  it('leads with late work and names today alongside it', () => {
    const segments = heroSegments({ ...NONE, late: 2, dueToday: 3 })
    expect(segments).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '2 late', tone: 'alert' },
      { text: ', ', tone: 'muted' },
      { text: '3 due today', tone: 'strong' },
    ])
  })

  it('reports late work alone when nothing else is due', () => {
    expect(heroSegments({ ...NONE, late: 1 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '1 late', tone: 'alert' },
    ])
  })

  it('reports today when nothing is late', () => {
    expect(heroSegments({ ...NONE, dueToday: 3 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '3 due today', tone: 'strong' },
    ])
  })

  it('falls back to the week when nothing is late or due today', () => {
    expect(heroSegments({ ...NONE, dueThisWeek: 4 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '4 due this week', tone: 'strong' },
    ])
  })

  it('says nothing is due when no work is outstanding', () => {
    expect(heroSegments(NONE)).toEqual([{ text: 'Nothing due today', tone: 'strong' }])
  })

  // The money clause attaches with "and"; the work clause uses a comma, so no
  // sentence ever carries two "and"s.
  it('appends the money clause when something is owed', () => {
    const segments = heroSegments({ ...NONE, late: 2, dueToday: 3, outstanding: 240_000 })
    expect(segments.slice(-2)).toEqual([
      { text: ' and ', tone: 'muted' },
      { text: `${formatMoney(240_000)} owed`, tone: 'money' },
    ])
  })

  it('omits the money clause when nothing is owed', () => {
    expect(heroSegments({ ...NONE, dueToday: 1 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '1 due today', tone: 'strong' },
    ])
  })

  it('reads sensibly when money is owed but no work is due', () => {
    expect(heroSegments({ ...NONE, outstanding: 5000 })).toEqual([
      { text: 'Nothing due today', tone: 'strong' },
      { text: ' and ', tone: 'muted' },
      { text: `${formatMoney(5000)} owed`, tone: 'money' },
    ])
  })

  // An overpaid order produces a negative balance. It must never surface as a
  // negative figure in the hero.
  it('ignores a non-positive outstanding total', () => {
    expect(heroSegments({ ...NONE, dueToday: 1, outstanding: -500 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '1 due today', tone: 'strong' },
    ])
  })
})
