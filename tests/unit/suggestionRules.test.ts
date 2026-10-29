import { describe, expect, it } from 'bun:test'

import { assessSuggestion, isPublicSourceUrl, mentionsADate } from '@/lib/communities/suggestion-rules'

const now = new Date('2026-12-10T12:00:00Z')

describe('isPublicSourceUrl', () => {
  it('accepts public web pages and rejects private hosts, social posts and non-urls', () => {
    expect(isPublicSourceUrl('https://epra.go.ke/december-review')).toBe(true)
    expect(isPublicSourceUrl('http://knbs.or.ke/cpi')).toBe(true)
    expect(isPublicSourceUrl('https://localhost/x')).toBe(false)
    expect(isPublicSourceUrl('https://192.168.1.1/x')).toBe(false)
    expect(isPublicSourceUrl('https://x.com/someone/status/1')).toBe(false)
    expect(isPublicSourceUrl('https://www.facebook.com/page')).toBe(false)
    expect(isPublicSourceUrl('EPRA monthly review')).toBe(false)
    expect(isPublicSourceUrl(null)).toBe(false)
  })
})

describe('mentionsADate', () => {
  it('finds years, months and days', () => {
    expect(mentionsADate('Will petrol pass 200 KES on 14 Dec?')).toBe(true)
    expect(mentionsADate('by 1 Feb 2027')).toBe(true)
    expect(mentionsADate('this weekend')).toBe(true)
    expect(mentionsADate('Will Nairobi get heavy rain?')).toBe(false)
  })
})

describe('assessSuggestion', () => {
  it('passes a dated, sourced draft that closes before the event', () => {
    const result = assessSuggestion({
      title: 'Will the CBK cut its base rate at the 3 Feb meeting?',
      resolutionRules:
        'Resolves YES if the Central Bank of Kenya announces a lower Central Bank Rate after its 3 February 2027 MPC meeting, per the official press release.',
      resolutionSource: 'https://www.centralbank.go.ke/press/',
      sourceUrl: null,
      closesAt: new Date('2027-02-02T21:00:00Z'),
      eventAt: new Date('2027-02-03T09:00:00Z'),
      now,
    })
    expect(result.checks).toEqual({ dated: true, publicSource: true, closesBeforeEvent: true })
    expect(result.confidence).toBe(1)
  })

  it('flags a vague, unsourced draft', () => {
    const result = assessSuggestion({
      title: 'Will Nairobi get heavy rain this weekend?',
      resolutionRules: null,
      resolutionSource: null,
      sourceUrl: null,
      closesAt: null,
      eventAt: null,
      now,
    })
    expect(result.checks.publicSource).toBe(false)
    expect(result.checks.closesBeforeEvent).toBe(false)
    expect(result.confidence).toBeLessThan(0.5)
  })

  it('fails the close check when the market closes after the event', () => {
    const result = assessSuggestion({
      title: 'Gor Mahia vs Tusker, Sun 21 Dec 4:00 pm: who wins?',
      resolutionRules: 'Resolves to the winner on the league results page after the final whistle on 21 December 2026.',
      resolutionSource: 'https://fkf.co.ke/results',
      sourceUrl: null,
      closesAt: new Date('2026-12-21T20:00:00Z'),
      eventAt: new Date('2026-12-21T13:00:00Z'),
      now,
    })
    expect(result.checks.closesBeforeEvent).toBe(false)
    expect(result.checks.dated).toBe(true)
    expect(result.checks.publicSource).toBe(true)
  })
})
