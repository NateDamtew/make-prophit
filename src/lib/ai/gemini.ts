/**
 * Gemini API client for community market creation assistance.
 * Uses Google's Generative Language API.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

export interface GeminiMessage {
  role: 'user' | 'model'
  parts: { text: string }[]
}

export interface MarketSuggestion {
  refined_title: string
  resolution_source: string
  resolution_rules: string
  suggested_resolution_date?: string
  clarifying_questions?: string[]
  warnings?: string[]
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
    finishReason?: string
  }>
  promptFeedback?: {
    blockReason?: string
  }
}

const MARKET_ASSISTANT_SYSTEM_PROMPT = `You are an expert prediction market designer assistant. Your job is to help community admins create clear, resolvable prediction markets.

Given a market question, you must:
1. Refine the title to be unambiguous and specific
2. Identify a reliable, verifiable resolution source (specific website, API, official body)
3. Write precise resolution rules that leave no room for interpretation
4. Suggest a reasonable resolution date if the question implies one
5. Flag any ambiguities or concerns

Respond ONLY with valid JSON matching this exact schema (no markdown fences, no commentary):
{
  "refined_title": "string - clear, specific question",
  "resolution_source": "string - specific data source/website/API",
  "resolution_rules": "string - precise rules for YES/NO resolution",
  "suggested_resolution_date": "string ISO date or null",
  "clarifying_questions": ["string - questions the admin should answer"],
  "warnings": ["string - concerns about ambiguity, manipulation, or data availability"]
}

Guidelines:
- Resolution rules must reference specific data sources (URLs, official bodies, indices)
- Avoid subjective terms like "good", "big", "moon" - use concrete thresholds
- For sports: cite the official league/governing body
- For finance: cite specific price feeds (CoinMarketCap, Bloomberg, etc.)
- For politics/elections: cite official electoral commissions or major news consensus
- If the question is too vague, populate clarifying_questions
- If the question can't be objectively resolved, add a warning`

export async function analyzeMarketQuestion(input: {
  question: string
  context?: string
}): Promise<MarketSuggestion> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Gemini API key is not configured.')
  }

  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'

  const userPrompt = `Market Question: ${input.question}\n${input.context ? `\nAdditional Context: ${input.context}` : ''}`

  const response = await fetch(
    `${GEMINI_API_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: MARKET_ASSISTANT_SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      }),
    },
  )

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    console.error('Gemini API error:', response.status, errorText)
    throw new Error(`Gemini API request failed (${response.status})`)
  }

  const data = (await response.json()) as GeminiResponse

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Content blocked: ${data.promptFeedback.blockReason}`)
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    throw new Error('Gemini returned an empty response.')
  }

  try {
    const parsed = JSON.parse(text) as MarketSuggestion
    if (!parsed.refined_title || !parsed.resolution_rules) {
      throw new Error('Invalid suggestion structure')
    }
    return {
      refined_title: parsed.refined_title,
      resolution_source: parsed.resolution_source ?? '',
      resolution_rules: parsed.resolution_rules,
      suggested_resolution_date: parsed.suggested_resolution_date,
      clarifying_questions: parsed.clarifying_questions ?? [],
      warnings: parsed.warnings ?? [],
    }
  }
  catch (err) {
    console.error('Failed to parse Gemini response:', text)
    throw new Error('Could not parse AI response. Please try again or refine your question.')
  }
}
