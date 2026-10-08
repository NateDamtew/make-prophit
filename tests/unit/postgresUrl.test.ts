import { describe, expect, it, spyOn } from 'bun:test'

import { normalizePostgresSslMode } from '@/lib/postgres-url'

const BASE = 'postgres://user:p%40ss@db.example.supabase.com:5432/postgres'

describe('normalizePostgresSslMode', () => {
  it('leaves valid or missing sslmode untouched', () => {
    for (const url of [BASE, `${BASE}?sslmode=require`, `${BASE}?sslmode=disable&supa=base-pooler.x`]) {
      expect(normalizePostgresSslMode(url)).toBe(url)
    }
  })

  it('repairs a truncated sslmode and keeps other params and credentials', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const fixed = normalizePostgresSslMode(`${BASE}?sslmode=requir&supa=base-pooler.x`)
    expect(new URL(fixed).searchParams.get('sslmode')).toBe('require')
    expect(new URL(fixed).searchParams.get('supa')).toBe('base-pooler.x')
    expect(fixed).toContain('p%40ss')
    expect(normalizePostgresSslMode(`${BASE}?sslmode=verify-ful`)).toContain('sslmode=verify-full')
    warn.mockRestore()
  })

  it('falls back to require for unrecognised values', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    expect(normalizePostgresSslMode(`${BASE}?sslmode=bogus`)).toContain('sslmode=require')
    warn.mockRestore()
  })

  it('returns unparseable strings unchanged', () => {
    expect(normalizePostgresSslMode('not a url')).toBe('not a url')
  })
})
