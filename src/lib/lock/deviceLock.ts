/**
 * Threat Model:
 * This module provides a framework-free WebCrypto lock. The PIN gates this application device
 * and generates an encryption key that can protect local data at rest.
 * It does NOT protect against a compromised device, keyloggers, or an OS-level attacker.
 * Note that an attacker who copies the storage (e.g., IndexedDB backups) can brute-force the
 * 10^6 six-digit PINs offline; the lockout mechanism only protects the UI path.
 */

export const LOCK_STORAGE_KEY = 'biohuman_lock_v1'

export interface LockStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export const MIN_PBKDF2_ITERATIONS = 210000

export const LOCK_KDF = {
  name: 'PBKDF2',
  hash: 'SHA-256',
  iterations: 600000,
  saltBytes: 16,
  keyBits: 256
} as const

export interface LockRecord {
  v: 1
  kdf: 'PBKDF2-SHA-256'
  iterations: number
  salt: string
  verifier: string
  failedAttempts: number
  lockedUntil: number | null
}

function toBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64Url(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveHKDFSubkeys(pin: string, salt: Uint8Array, iterations: number) {
  const pinKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )

  // Single expensive PBKDF2 derivation
  const prkBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256'
    },
    pinKey,
    256 // 32 bytes
  )

  const prkKey = await crypto.subtle.importKey(
    'raw',
    prkBits,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  )

  // Derive AES-GCM encryption key
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0) as unknown as BufferSource,
      info: new TextEncoder().encode('biohuman-lock-v1-aes') as unknown as BufferSource
    },
    prkKey,
    { name: 'AES-GCM', length: 256 },
    false, // never extractable
    ['encrypt', 'decrypt']
  )

  // Derive HMAC verifier key
  const hmacKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0) as unknown as BufferSource,
      info: new TextEncoder().encode('biohuman-lock-v1-verifier') as unknown as BufferSource
    },
    prkKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false, // never extractable
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', hmacKey, new Uint8Array([1]))

  return { verifier: toBase64Url(signature), key: aesKey }
}

export async function setupPin(pin: string, storage: LockStorage): Promise<LockRecord> {
  if (!/^\d{6,12}$/.test(pin)) {
    throw new Error('PIN must be 6 to 12 digits')
  }

  const salt = crypto.getRandomValues(new Uint8Array(LOCK_KDF.saltBytes))
  const { verifier } = await deriveHKDFSubkeys(pin, salt, LOCK_KDF.iterations)

  const record: LockRecord = {
    v: 1,
    kdf: 'PBKDF2-SHA-256',
    iterations: LOCK_KDF.iterations,
    salt: toBase64Url(salt),
    verifier,
    failedAttempts: 0,
    lockedUntil: null
  }

  storage.set(LOCK_STORAGE_KEY, JSON.stringify(record))
  return record
}

function parseAndValidateRecord(recordStr: string): LockRecord {
  let record: any
  try {
    record = JSON.parse(recordStr)
  } catch (e) {
    throw new Error('Corrupt lock record')
  }

  if (!record || typeof record !== 'object') throw new Error('Corrupt lock record')
  if (record.v !== 1) throw new Error('Corrupt lock record')
  if (record.kdf !== 'PBKDF2-SHA-256') throw new Error('Corrupt lock record')

  if (typeof record.iterations !== 'number' || record.iterations < MIN_PBKDF2_ITERATIONS || record.iterations > 10000000) {
    throw new Error('Corrupt lock record')
  }

  if (typeof record.salt !== 'string' || fromBase64Url(record.salt).byteLength !== 16) {
    throw new Error('Corrupt lock record')
  }

  if (typeof record.verifier !== 'string' || fromBase64Url(record.verifier).byteLength !== 32) {
    throw new Error('Corrupt lock record')
  }

  if (!Number.isInteger(record.failedAttempts) || record.failedAttempts < 0) {
    throw new Error('Corrupt lock record')
  }

  if (record.lockedUntil !== null && (typeof record.lockedUntil !== 'number' || !Number.isFinite(record.lockedUntil))) {
    throw new Error('Corrupt lock record')
  }

  return record as LockRecord
}

export async function unlock(
  pin: string,
  storage: LockStorage,
  now: () => number = Date.now
): Promise<{ ok: true; key: CryptoKey } | { ok: false; reason: 'wrong-pin' | 'locked-out' }> {
  const recordStr = storage.get(LOCK_STORAGE_KEY)
  if (!recordStr) throw new Error('No lock record found')

  const record = parseAndValidateRecord(recordStr)

  // 1) Pre-derivation lockout check
  if (record.lockedUntil !== null && now() < record.lockedUntil) {
    return { ok: false, reason: 'locked-out' }
  }

  // Reset expired lockout before anything else
  if (record.lockedUntil !== null && now() >= record.lockedUntil) {
    record.failedAttempts = 0
    record.lockedUntil = null
  }

  // 2) PRE-DERIVATION WRONG-PIN STATE INCREMENT
  // We increment failed attempts BEFORE deriving to prevent concurrent brute force bypass.
  // We assume it's a wrong attempt until proven correct.
  record.failedAttempts++
  if (record.failedAttempts >= 5) {
    record.lockedUntil = now() + 5 * 60 * 1000
  }
  storage.set(LOCK_STORAGE_KEY, JSON.stringify(record))

  // Validate format. Invalid format is treated as wrong-pin.
  if (!/^\d{6,12}$/.test(pin)) {
    return { ok: false, reason: 'wrong-pin' }
  }

  // 3) Derivation
  const saltBytes = fromBase64Url(record.salt)
  const { verifier, key: aesKey } = await deriveHKDFSubkeys(pin, saltBytes, record.iterations)

  const storedVerifierBytes = fromBase64Url(record.verifier)
  const candidateVerifierBytes = fromBase64Url(verifier)

  let mismatch = 0
  for (let i = 0; i < storedVerifierBytes.byteLength; i++) {
    mismatch |= storedVerifierBytes[i] ^ candidateVerifierBytes[i]
  }

  if (mismatch !== 0) {
    // Failed: state already saved above
    return { ok: false, reason: 'wrong-pin' }
  }

  // Success: Reset state
  record.failedAttempts = 0
  record.lockedUntil = null
  storage.set(LOCK_STORAGE_KEY, JSON.stringify(record))

  return { ok: true, key: aesKey }
}

export async function biometricsAvailable(): Promise<boolean> {
  if (typeof PublicKeyCredential === 'undefined') return false
  if (!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false
  try {
    return !!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch (e) {
    return false
  }
}

export async function encryptWithKey(key: CryptoKey, plaintext: string): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    encoded
  )

  return {
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(encrypted)
  }
}

export async function decryptWithKey(key: CryptoKey, data: { iv: string; ciphertext: string }): Promise<string> {
  const ivBytes = fromBase64Url(data.iv)
  const ciphertextBytes = fromBase64Url(data.ciphertext)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
    key,
    ciphertextBytes as unknown as BufferSource
  )

  return new TextDecoder().decode(decrypted)
}
