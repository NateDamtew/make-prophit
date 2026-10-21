import { describe, expect, it } from 'bun:test'
import { Buffer } from 'node:buffer'
import { createHash, generateKeyPairSync, sign as cryptoSign } from 'node:crypto'

import type { SignatureRequestContext } from '@/lib/pawapay/signature'

import {
  buildSignatureBase,
  parseSignatureHeader,
  parseSignatureInput,
  signatureContextFromRequest,
  verifyCallbackSignature,
  verifyContentDigest,
} from '@/lib/pawapay/signature'

const KEY_ID = 'HTTP_EC_P256_KEY:1'
const NOW = 1_760_000_000_000

function digestHeader(body: Uint8Array) {
  return `sha-256=:${createHash('sha256').update(body).digest('base64')}:`
}

function makeSignedRequest(options: {
  body: string
  privateKey: Parameters<typeof cryptoSign>[2]
  alg?: string
  created?: number
  expires?: number
  keyid?: string
  dsaEncoding?: 'ieee-p1363' | 'der'
  padding?: number
  saltLength?: number
  hash?: string
  tamperBody?: string
}) {
  const bodyBytes = Buffer.from(options.body, 'utf8')
  const created = options.created ?? Math.floor(NOW / 1000) - 5
  const expires = options.expires ?? created + 300
  const alg = options.alg ?? 'ecdsa-p256-sha256'
  const keyid = options.keyid ?? KEY_ID
  const signatureDate = new Date(created * 1000).toUTCString()
  const params = `("@method" "@authority" "@path" "signature-date" "content-digest" "content-type");alg="${alg}";keyid="${keyid}";created=${created};expires=${expires}`

  const headers = new Headers({
    'content-type': 'application/json',
    'content-digest': digestHeader(bodyBytes),
    'signature-date': signatureDate,
    host: 'beta.makeprophit.com',
  })
  const context: SignatureRequestContext = {
    method: 'POST',
    authority: 'beta.makeprophit.com',
    path: '/api/mobile-money/pawapay/callback',
    headers,
  }
  const base = buildSignatureBase(
    {
      label: 'sig-pp',
      components: ['@method', '@authority', '@path', 'signature-date', 'content-digest', 'content-type'],
      signatureParams: params,
    },
    context,
  )
  if (base === null) {
    throw new Error('base missing component')
  }
  const signature = cryptoSign(options.hash ?? 'sha256', Buffer.from(base, 'utf8'), {
    key: options.privateKey as never,
    dsaEncoding: options.dsaEncoding ?? 'ieee-p1363',
    ...(options.padding !== undefined ? { padding: options.padding } : {}),
    ...(options.saltLength !== undefined ? { saltLength: options.saltLength } : {}),
  } as never)
  headers.set('signature-input', `sig-pp=${params}`)
  headers.set('signature', `sig-pp=:${signature.toString('base64')}:`)

  const rawBody = Buffer.from(options.tamperBody ?? options.body, 'utf8')
  return { context, rawBody, base }
}

describe('parseSignatureInput', () => {
  it('parses label, components and params', () => {
    const parsed = parseSignatureInput(
      'sig-pp=("@method" "@authority" "content-digest");alg="ecdsa-p256-sha256";keyid="K:1";created=1700000000;expires=1700000300',
    )
    expect(parsed).not.toBeNull()
    expect(parsed?.label).toBe('sig-pp')
    expect(parsed?.components).toEqual(['@method', '@authority', 'content-digest'])
    expect(parsed?.alg).toBe('ecdsa-p256-sha256')
    expect(parsed?.keyid).toBe('K:1')
    expect(parsed?.created).toBe(1_700_000_000)
    expect(parsed?.expires).toBe(1_700_000_300)
    expect(parsed?.signatureParams).toBe(
      '("@method" "@authority" "content-digest");alg="ecdsa-p256-sha256";keyid="K:1";created=1700000000;expires=1700000300',
    )
  })

  it('returns null for garbage', () => {
    expect(parseSignatureInput('nonsense')).toBeNull()
  })
})

describe('parseSignatureHeader', () => {
  it('extracts the base64 value for the matching label', () => {
    const sig = parseSignatureHeader('other=:AAAA:, sig-pp=:AQID:', 'sig-pp')
    expect(sig).toEqual(Buffer.from([1, 2, 3]))
    expect(parseSignatureHeader('sig-pp=AQID', 'sig-pp')).toBeNull()
    expect(parseSignatureHeader('x=:AQID:', 'sig-pp')).toBeNull()
  })
})

describe('verifyContentDigest', () => {
  it('accepts a matching sha-256 digest and rejects a mismatch', () => {
    const body = Buffer.from('{"a":1}')
    expect(verifyContentDigest(digestHeader(body), body)).toBe(true)
    expect(verifyContentDigest(digestHeader(body), Buffer.from('{"a":2}'))).toBe(false)
    expect(verifyContentDigest(null, body)).toBe(false)
    expect(verifyContentDigest('md5=:AAAA:', body)).toBe(false)
  })
})

describe('verifyCallbackSignature', () => {
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const ecPem = ec.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  async function getKey(keyId: string | undefined) {
    return keyId === KEY_ID ? ecPem : null
  }
  const body = JSON.stringify({ depositId: 'd1', status: 'COMPLETED', amount: '1000', currency: 'KES' })

  it('verifies a valid ECDSA P-256 signature', async () => {
    const { context, rawBody } = makeSignedRequest({ body, privateKey: ec.privateKey })
    const result = await verifyCallbackSignature({ request: context, rawBody, getPublicKeyPem: getKey, now: () => NOW })
    expect(result).toEqual({ ok: true, keyId: KEY_ID })
  })

  it('rejects a tampered body', async () => {
    const { context, rawBody } = makeSignedRequest({
      body,
      privateKey: ec.privateKey,
      tamperBody: body.replace('1000', '9000'),
    })
    const result = await verifyCallbackSignature({ request: context, rawBody, getPublicKeyPem: getKey, now: () => NOW })
    expect(result).toEqual({ ok: false, reason: 'content_digest_mismatch' })
  })

  it('rejects a signature from a different key', async () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const { context, rawBody } = makeSignedRequest({ body, privateKey: other.privateKey })
    const result = await verifyCallbackSignature({ request: context, rawBody, getPublicKeyPem: getKey, now: () => NOW })
    expect(result).toEqual({ ok: false, reason: 'signature_mismatch' })
  })

  it('rejects an unknown keyid, an expired signature, and missing headers', async () => {
    const unknown = makeSignedRequest({ body, privateKey: ec.privateKey, keyid: 'nope' })
    expect(
      await verifyCallbackSignature({
        request: unknown.context,
        rawBody: unknown.rawBody,
        getPublicKeyPem: getKey,
        now: () => NOW,
      }),
    ).toEqual({ ok: false, reason: 'unknown_key' })

    const expired = makeSignedRequest({
      body,
      privateKey: ec.privateKey,
      created: Math.floor(NOW / 1000) - 3600,
      expires: Math.floor(NOW / 1000) - 1800,
    })
    expect(
      await verifyCallbackSignature({
        request: expired.context,
        rawBody: expired.rawBody,
        getPublicKeyPem: getKey,
        now: () => NOW,
      }),
    ).toEqual({ ok: false, reason: 'signature_expired' })

    const bare: SignatureRequestContext = {
      method: 'POST',
      authority: 'beta.makeprophit.com',
      path: '/x',
      headers: new Headers({ 'content-type': 'application/json' }),
    }
    expect(
      await verifyCallbackSignature({ request: bare, rawBody: Buffer.from(body), getPublicKeyPem: getKey }),
    ).toEqual({
      ok: false,
      reason: 'missing_signature_headers',
    })
  })

  it('rejects when the authority or path differ from what was signed', async () => {
    const { context, rawBody } = makeSignedRequest({ body, privateKey: ec.privateKey })
    const moved = { ...context, path: '/api/other' }
    const result = await verifyCallbackSignature({ request: moved, rawBody, getPublicKeyPem: getKey, now: () => NOW })
    expect(result).toEqual({ ok: false, reason: 'signature_mismatch' })
  })

  it('verifies RSA-PSS SHA-512 and RSA PKCS#1 v1.5 SHA-256 signatures', async () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const rsaPem = rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    async function getRsa() {
      return rsaPem
    }

    const pss = makeSignedRequest({
      body,
      privateKey: rsa.privateKey,
      alg: 'rsa-pss-sha512',
      hash: 'sha512',
      padding: 6,
      saltLength: 64,
      dsaEncoding: 'der',
    })
    expect(
      await verifyCallbackSignature({
        request: pss.context,
        rawBody: pss.rawBody,
        getPublicKeyPem: getRsa,
        now: () => NOW,
      }),
    ).toEqual({
      ok: true,
      keyId: KEY_ID,
    })

    const v15 = makeSignedRequest({
      body,
      privateKey: rsa.privateKey,
      alg: 'rsa-v1_5-sha256',
      hash: 'sha256',
      padding: 1,
      dsaEncoding: 'der',
    })
    expect(
      await verifyCallbackSignature({
        request: v15.context,
        rawBody: v15.rawBody,
        getPublicKeyPem: getRsa,
        now: () => NOW,
      }),
    ).toEqual({
      ok: true,
      keyId: KEY_ID,
    })
  })
})

describe('signatureContextFromRequest', () => {
  it('prefers forwarded host/proto and strips the query from @path', () => {
    const request = new Request('http://internal:3000/api/mobile-money/pawapay/callback?x=1', {
      method: 'POST',
      headers: { 'x-forwarded-host': 'beta.makeprophit.com', 'x-forwarded-proto': 'https', host: 'internal:3000' },
    })
    const context = signatureContextFromRequest(request)
    expect(context.method).toBe('POST')
    expect(context.authority).toBe('beta.makeprophit.com')
    expect(context.path).toBe('/api/mobile-money/pawapay/callback')
    expect(context.query).toBe('x=1')
    expect(context.scheme).toBe('https')
  })
})
