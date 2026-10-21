import { Buffer } from 'node:buffer'
import { createHash, createPublicKey, timingSafeEqual, verify as cryptoVerify } from 'node:crypto'

/**
 * RFC 9421 HTTP Message Signature verification for pawaPay signed callbacks.
 *
 * pawaPay sends: Content-Digest, Signature, Signature-Input, Signature-Date,
 * Content-Type. Signature-Input lists the covered components and parameters
 * (alg, keyid, created, expires); the key is fetched from /v2/public-key/http
 * by `keyid`. Algorithms per RFC 9421 §3.3: ECDSA signatures are the raw
 * r||s concatenation (ieee-p1363), RSA-PSS uses a salt length equal to the
 * digest length.
 */

export type PawaPaySignatureAlgorithm = 'ecdsa-p256-sha256' | 'ecdsa-p384-sha384' | 'rsa-pss-sha512' | 'rsa-v1_5-sha256'

export interface ParsedSignatureInput {
  label: string
  components: string[]
  /** The raw inner-list + params string exactly as it appeared after `label=`. */
  signatureParams: string
  alg?: string
  keyid?: string
  created?: number
  expires?: number
}

export interface SignatureRequestContext {
  method: string
  /** Host header, lowercase. */
  authority: string
  /** Pathname only. */
  path: string
  query?: string
  scheme?: string
  headers: Headers
}

export interface VerifyCallbackSignatureInput {
  request: SignatureRequestContext
  rawBody: Uint8Array
  getPublicKeyPem: (keyId: string | undefined) => Promise<string | null>
  now?: () => number
  /** Allowed clock skew when checking created/expires, in seconds. */
  clockSkewSeconds?: number
  /** Max signature age when `expires` is absent, in seconds. */
  maxAgeSeconds?: number
}

export type VerifyCallbackSignatureResult = { ok: true; keyId: string | undefined } | { ok: false; reason: string }

const SIGNATURE_LABEL_PATTERN = /^\s*([!#$%&'*+\-.^_`|~\w]+)=\((.*?)\)(.*)$/s

export function parseSignatureInput(headerValue: string): ParsedSignatureInput | null {
  const match = SIGNATURE_LABEL_PATTERN.exec(headerValue)
  if (!match) {
    return null
  }
  const [, label, inner, paramsRaw] = match
  const components = Array.from(inner.matchAll(/"([^"]+)"/g), (m) => m[1])
  const params: Record<string, string> = {}
  for (const part of paramsRaw.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) {
      continue
    }
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      params[trimmed] = ''
      continue
    }
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    params[key] = value
  }
  const created = params.created !== undefined ? Number(params.created) : undefined
  const expires = params.expires !== undefined ? Number(params.expires) : undefined
  return {
    label,
    components,
    signatureParams: `(${inner})${paramsRaw}`.trim(),
    alg: params.alg,
    keyid: params.keyid,
    created: Number.isFinite(created) ? created : undefined,
    expires: Number.isFinite(expires) ? expires : undefined,
  }
}

/** Extract the base64 signature for `label` from a `Signature: label=:base64:` header. */
export function parseSignatureHeader(headerValue: string, label: string): Buffer | null {
  for (const member of headerValue.split(',')) {
    const trimmed = member.trim()
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      continue
    }
    if (trimmed.slice(0, eq).trim() !== label) {
      continue
    }
    const value = trimmed.slice(eq + 1).trim()
    if (!value.startsWith(':') || !value.endsWith(':')) {
      return null
    }
    try {
      return Buffer.from(value.slice(1, -1), 'base64')
    } catch {
      return null
    }
  }
  return null
}

/** Check `Content-Digest: sha-256=:base64:` (or sha-512) against the body. */
export function verifyContentDigest(headerValue: string | null, rawBody: Uint8Array): boolean {
  if (!headerValue) {
    return false
  }
  for (const member of headerValue.split(',')) {
    const trimmed = member.trim()
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      continue
    }
    const algorithm = trimmed.slice(0, eq).trim().toLowerCase()
    const value = trimmed.slice(eq + 1).trim()
    if (!value.startsWith(':') || !value.endsWith(':')) {
      continue
    }
    const nodeAlgorithm = algorithm === 'sha-256' ? 'sha256' : algorithm === 'sha-512' ? 'sha512' : null
    if (!nodeAlgorithm) {
      continue
    }
    const expected = createHash(nodeAlgorithm).update(rawBody).digest()
    const received = Buffer.from(value.slice(1, -1), 'base64')
    if (expected.length === received.length && timingSafeEqual(expected, received)) {
      return true
    }
  }
  return false
}

function componentValue(name: string, context: SignatureRequestContext): string | null {
  switch (name) {
    case '@method':
      return context.method.toUpperCase()
    case '@authority':
      return context.authority.toLowerCase()
    case '@path':
      return context.path
    case '@query':
      return context.query ? `?${context.query.replace(/^\?/, '')}` : '?'
    case '@scheme':
      return (context.scheme ?? 'https').toLowerCase()
    case '@target-uri':
      return `${(context.scheme ?? 'https').toLowerCase()}://${context.authority.toLowerCase()}${context.path}${context.query ? `?${context.query.replace(/^\?/, '')}` : ''}`
    case '@request-target':
      return `${context.path}${context.query ? `?${context.query.replace(/^\?/, '')}` : ''}`
    default: {
      if (name.startsWith('@')) {
        return null
      }
      const value = context.headers.get(name)
      if (value === null) {
        return null
      }
      return value
        .split('\n')
        .map((line) => line.trim())
        .join(' ')
        .trim()
    }
  }
}

/** Build the RFC 9421 signature base for the parsed input. Returns null if a covered component is missing. */
export function buildSignatureBase(parsed: ParsedSignatureInput, context: SignatureRequestContext): string | null {
  const lines: string[] = []
  for (const component of parsed.components) {
    const value = componentValue(component.toLowerCase(), context)
    if (value === null) {
      return null
    }
    lines.push(`"${component.toLowerCase()}": ${value}`)
  }
  lines.push(`"@signature-params": ${parsed.signatureParams}`)
  return lines.join('\n')
}

function verifyWithAlgorithm(
  algorithm: string | undefined,
  publicKeyPem: string,
  base: string,
  signature: Buffer,
): boolean {
  const key = createPublicKey(publicKeyPem)
  const data = Buffer.from(base, 'utf8')
  const alg = (algorithm ??
    inferAlgorithm(key.asymmetricKeyType, key.asymmetricKeyDetails?.namedCurve)) as PawaPaySignatureAlgorithm
  switch (alg) {
    case 'ecdsa-p256-sha256':
      return cryptoVerify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, signature)
    case 'ecdsa-p384-sha384':
      return cryptoVerify('sha384', data, { key, dsaEncoding: 'ieee-p1363' }, signature)
    case 'rsa-pss-sha512':
      return cryptoVerify('sha512', data, { key, padding: 6 /* RSA_PKCS1_PSS_PADDING */, saltLength: 64 }, signature)
    case 'rsa-v1_5-sha256':
      return cryptoVerify('sha256', data, { key, padding: 1 /* RSA_PKCS1_PADDING */ }, signature)
    default:
      return false
  }
}

function inferAlgorithm(keyType: string | undefined, curve: string | undefined): PawaPaySignatureAlgorithm | undefined {
  if (keyType === 'ec') {
    return curve === 'secp384r1' ? 'ecdsa-p384-sha384' : 'ecdsa-p256-sha256'
  }
  if (keyType === 'rsa-pss') {
    return 'rsa-pss-sha512'
  }
  if (keyType === 'rsa') {
    return 'rsa-v1_5-sha256'
  }
  return undefined
}

export async function verifyCallbackSignature(
  input: VerifyCallbackSignatureInput,
): Promise<VerifyCallbackSignatureResult> {
  const { request, rawBody } = input
  const now = Math.floor((input.now ?? Date.now)() / 1000)
  const skew = input.clockSkewSeconds ?? 300
  const maxAge = input.maxAgeSeconds ?? 900

  const signatureInputHeader = request.headers.get('signature-input')
  const signatureHeader = request.headers.get('signature')
  if (!signatureInputHeader || !signatureHeader) {
    return { ok: false, reason: 'missing_signature_headers' }
  }

  if (!verifyContentDigest(request.headers.get('content-digest'), rawBody)) {
    return { ok: false, reason: 'content_digest_mismatch' }
  }

  const parsed = parseSignatureInput(signatureInputHeader)
  if (!parsed) {
    return { ok: false, reason: 'malformed_signature_input' }
  }
  if (!parsed.components.some((c) => c.toLowerCase() === 'content-digest')) {
    return { ok: false, reason: 'content_digest_not_covered' }
  }
  if (parsed.expires !== undefined && parsed.expires + skew < now) {
    return { ok: false, reason: 'signature_expired' }
  }
  if (parsed.created !== undefined) {
    if (parsed.created - skew > now) {
      return { ok: false, reason: 'signature_from_future' }
    }
    if (parsed.expires === undefined && parsed.created + maxAge < now) {
      return { ok: false, reason: 'signature_too_old' }
    }
  }

  const signature = parseSignatureHeader(signatureHeader, parsed.label)
  if (!signature || signature.length === 0) {
    return { ok: false, reason: 'malformed_signature' }
  }

  const base = buildSignatureBase(parsed, request)
  if (base === null) {
    return { ok: false, reason: 'missing_covered_component' }
  }

  const publicKeyPem = await input.getPublicKeyPem(parsed.keyid)
  if (!publicKeyPem) {
    return { ok: false, reason: 'unknown_key' }
  }

  try {
    return verifyWithAlgorithm(parsed.alg, publicKeyPem, base, signature)
      ? { ok: true, keyId: parsed.keyid }
      : { ok: false, reason: 'signature_mismatch' }
  } catch {
    return { ok: false, reason: 'verification_error' }
  }
}

/** Build the request context from a Next.js/Fetch `Request`, preferring forwarded headers behind a proxy. */
export function signatureContextFromRequest(request: Request): SignatureRequestContext {
  const url = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const authority = (forwardedHost || request.headers.get('host') || url.host).toLowerCase()
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  return {
    method: request.method,
    authority,
    path: url.pathname,
    query: url.search ? url.search.slice(1) : undefined,
    scheme: forwardedProto || url.protocol.replace(':', ''),
    headers: request.headers,
  }
}
