import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeMarketQuestion } from '@/lib/ai/gemini'

const originalFetch = global.fetch
const originalEnv = { ...process.env }

describe('gemini: analyzeMarketQuestion', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key'
    process.env.GEMINI_MODEL = 'gemini-2.5-flash'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it('throws if GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY
    await expect(analyzeMarketQuestion({ question: 'Will it happen?' }))
      .rejects.toThrow(/not configured/i)
  })

  it('parses a valid JSON response from gemini', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                refined_title: 'Will GDP exceed 8%?',
                resolution_source: 'World Bank',
                resolution_rules: 'Resolves YES if WB reports >=8% growth.',
                suggested_resolution_date: '2026-12-31',
                clarifying_questions: ['real or nominal?'],
                warnings: ['data may revise'],
              }),
            }],
          },
        }],
      }),
    }) as any

    const result = await analyzeMarketQuestion({ question: 'Will GDP grow more than 8%?' })

    expect(result.refined_title).toBe('Will GDP exceed 8%?')
    expect(result.resolution_source).toBe('World Bank')
    expect(result.suggested_resolution_date).toBe('2026-12-31')
    expect(result.clarifying_questions).toHaveLength(1)
    expect(result.warnings).toHaveLength(1)
  })

  it('throws on blocked content', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        promptFeedback: { blockReason: 'HARM_CATEGORY_DANGEROUS' },
      }),
    }) as any

    await expect(analyzeMarketQuestion({ question: 'something bad' }))
      .rejects.toThrow(/blocked/i)
  })

  it('throws on non-OK HTTP response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Error',
    }) as any

    await expect(analyzeMarketQuestion({ question: 'Will X happen?' }))
      .rejects.toThrow(/500/)
  })

  it('throws when response is not valid JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'not json' }] } }],
      }),
    }) as any

    await expect(analyzeMarketQuestion({ question: 'Will X happen?' }))
      .rejects.toThrow(/parse/i)
  })

  it('throws when response is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] }),
    }) as any

    await expect(analyzeMarketQuestion({ question: 'Will X happen?' }))
      .rejects.toThrow(/empty/i)
  })

  it('defaults clarifying_questions and warnings to empty arrays', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                refined_title: 'X',
                resolution_source: 'Y',
                resolution_rules: 'Z',
              }),
            }],
          },
        }],
      }),
    }) as any

    const result = await analyzeMarketQuestion({ question: 'q' })
    expect(result.clarifying_questions).toEqual([])
    expect(result.warnings).toEqual([])
  })
})
