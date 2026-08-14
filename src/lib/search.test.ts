import { describe, expect, it } from 'vitest'
import { filterByQuery, matchesQuery } from './search'

describe('matchesQuery', () => {
  it('matches everything on an empty or blank query', () => {
    expect(matchesQuery('', { text: ['Ama'] })).toBe(true)
    expect(matchesQuery('   ', { text: ['Ama'] })).toBe(true)
  })

  it('matches text case-insensitively, anywhere in the value', () => {
    expect(matchesQuery('kell', { text: ['Mrs. Okello'] })).toBe(true)
    expect(matchesQuery('OKELLO', { text: ['Mrs. Okello'] })).toBe(true)
    expect(matchesQuery('zzz', { text: ['Mrs. Okello'] })).toBe(false)
  })

  it('tries every text field it is given', () => {
    expect(matchesQuery('gomesi', { text: ['Kanzu', 'Gomesi'] })).toBe(true)
  })

  it('skips fields that are absent', () => {
    expect(matchesQuery('ama', { text: [undefined, null, 'Ama'] })).toBe(true)
    expect(matchesQuery('ama', { text: [undefined, null] })).toBe(false)
  })

  /* The bug this replaces: ClientPicker and Suppliers compared the raw query
     against the raw phone, so a number typed with spaces found nothing. */
  it('matches a phone however either side is punctuated', () => {
    const fields = { phone: ['+256 700 000 123'] }
    expect(matchesQuery('0700 000', fields)).toBe(true)
    expect(matchesQuery('0700000', fields)).toBe(true)
    expect(matchesQuery('700-000', fields)).toBe(true)
    expect(matchesQuery('256700000123', fields)).toBe(true)
  })

  it('does not match a phone on digits it does not contain', () => {
    expect(matchesQuery('999', { phone: ['+256 700 000 123'] })).toBe(false)
  })

  /* A word query must not fall through to the phone check and match every
     record whose number happens to contain nothing. */
  it('ignores phone fields when the query has no digits', () => {
    expect(matchesQuery('ama', { phone: ['+256700000123'] })).toBe(false)
  })

  it('matches on either a name or a number', () => {
    const fields = { text: ['Mrs. Okello'], phone: ['0700000123'] }
    expect(matchesQuery('okello', fields)).toBe(true)
    expect(matchesQuery('700000', fields)).toBe(true)
    expect(matchesQuery('nothing', fields)).toBe(false)
  })

  /* A digit typed against a name is still a text search first: "7" should find
     "Suit 7" even though it is also a digit. */
  it('prefers a text hit over the phone rule', () => {
    expect(matchesQuery('7', { text: ['Suit 7'], phone: ['0800000000'] })).toBe(true)
  })
})

describe('filterByQuery', () => {
  const clients = [
    { name: 'Mrs. Okello', phone: '+256 700 000 123' },
    { name: 'Mr. Ssali', phone: undefined },
    { name: 'Aisha Nakato', phone: '0772 111 222' },
  ]
  const fieldsOf = (c: (typeof clients)[number]) => ({ text: [c.name], phone: [c.phone] })

  it('returns everything, as a copy, on a blank query', () => {
    const all = filterByQuery(clients, '  ', fieldsOf)
    expect(all).toEqual(clients)
    expect(all).not.toBe(clients)
  })

  it('narrows by name', () => {
    expect(filterByQuery(clients, 'ssali', fieldsOf).map((c) => c.name)).toEqual(['Mr. Ssali'])
  })

  it('narrows by a spaced number', () => {
    expect(filterByQuery(clients, '0772 111', fieldsOf).map((c) => c.name)).toEqual([
      'Aisha Nakato',
    ])
  })

  it('returns nothing when nothing matches', () => {
    expect(filterByQuery(clients, 'zzz', fieldsOf)).toEqual([])
  })
})

/* The trunk zero: a Ugandan number is typed 0700... and stored +256700... */
describe('national and international forms of the same number', () => {
  const stored = { phone: ['+256700000123'] }

  it('finds an E.164 number from its national form', () => {
    expect(matchesQuery('0700000123', stored)).toBe(true)
    expect(matchesQuery('0700 000', stored)).toBe(true)
  })

  it('finds it from the international form too', () => {
    expect(matchesQuery('+256 700 000 123', stored)).toBe(true)
  })

  it('still refuses a number that is simply different', () => {
    expect(matchesQuery('0772111222', stored)).toBe(false)
  })
})
