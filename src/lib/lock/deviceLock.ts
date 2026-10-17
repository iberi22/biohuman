/**
 * Threat Model:
 * This module provides a framework-free WebCrypto lock. The PIN gates this application device
 * and generates an encryption key that can protect local data at rest.
 * It does NOT protect against a compromised device, keyloggers, or an OS-level attacker.
 */

export const LOCK_STORAGE_KEY = 'biohuman_lock_v1'

export interface LockStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

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

function toBase64Url(buffer: ArrayBuffer): string {
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

const VERIFIER_MESSAGE = new TextEncoder().encode('biohuman-lock-v1')

async function derive(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: LOCK_KDF.iterations,
      hash: LOCK_KDF.hash
    },
    keyMaterial,
    { name: 'AES-GCM', length: LOCK_KDF.keyBits },
    true, // Extractable required for deriving the verifier (HMAC)
    ['encrypt', 'decrypt']
  )
}

async function deriveVerifier(pin: string, salt: Uint8Array): Promise<{ verifier: string; key: CryptoKey }> {
  // Derive the AES-GCM key
  const aesKey = await derive(pin, salt)

  // To compute a verifier, we export the raw derived key and use it as an HMAC key
  const rawKey = await crypto.subtle.exportKey('raw', aesKey)

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', hmacKey, VERIFIER_MESSAGE)
  return { verifier: toBase64Url(signature), key: aesKey }
}

export async function setupPin(pin: string, storage: LockStorage, now: () => number = Date.now): Promise<LockRecord> {
  if (!/^\d{6,12}$/.test(pin)) {
    throw new Error('PIN must be 6 to 12 digits')
  }

  const salt = crypto.getRandomValues(new Uint8Array(LOCK_KDF.saltBytes)) as Uint8Array
  const { verifier } = await deriveVerifier(pin, salt)

  const record: LockRecord = {
    v: 1,
    kdf: 'PBKDF2-SHA-256',
    iterations: LOCK_KDF.iterations,
    salt: toBase64Url(salt.buffer as unknown as ArrayBuffer),
    verifier,
    failedAttempts: 0,
    lockedUntil: null
  }

  storage.set(LOCK_STORAGE_KEY, JSON.stringify(record))
  return record
}

export async function unlock(
  pin: string,
  storage: LockStorage,
  now: () => number = Date.now
): Promise<{ ok: true; key: CryptoKey } | { ok: false; reason: 'wrong-pin' | 'locked-out' }> {
  const recordStr = storage.get(LOCK_STORAGE_KEY)
  if (!recordStr) throw new Error('No lock record found')
  const record: LockRecord = JSON.parse(recordStr)

  if (record.lockedUntil !== null && now() < record.lockedUntil) {
    return { ok: false, reason: 'locked-out' }
  }

  const saltBytes = fromBase64Url(record.salt)
  const { verifier, key: aesKey } = await deriveVerifier(pin, saltBytes)

  // Constant-time string comparison not directly available in standard JS without WebCrypto,
  // but we can use HMAC verify for constant time.
  const storedVerifierBytes = fromBase64Url(record.verifier)
  const candidateVerifierBytes = fromBase64Url(verifier)

  // If lengths don't match, immediate failure (should not happen for HMAC-SHA256 which is 32 bytes)
  if (storedVerifierBytes.byteLength !== candidateVerifierBytes.byteLength) {
    return handleFailure(recordStr, record, storage, now)
  }

  // Use crypto.subtle.verify or a bitwise check
  let mismatch = 0
  for (let i = 0; i < storedVerifierBytes.byteLength; i++) {
    mismatch |= storedVerifierBytes[i] ^ candidateVerifierBytes[i]
  }

  if (mismatch !== 0) {
    return handleFailure(recordStr, record, storage, now)
  }

  // Success
  if (record.failedAttempts > 0 || record.lockedUntil !== null) {
    record.failedAttempts = 0
    record.lockedUntil = null
    storage.set(LOCK_STORAGE_KEY, JSON.stringify(record))
  }

  // Turn off extractable constraint for the returned AES-GCM key since it should not leave WebCrypto
  // Re-deriving it as non-extractable:
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  const finalKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: record.iterations, // using the stored iterations, just to be safe
      hash: LOCK_KDF.hash
    },
    keyMaterial,
    { name: 'AES-GCM', length: LOCK_KDF.keyBits },
    false, // extractable: false
    ['encrypt', 'decrypt']
  )

  return { ok: true, key: finalKey }
}

async function handleFailure(
  recordStr: string,
  record: LockRecord,
  storage: LockStorage,
  now: () => number
): Promise<{ ok: false; reason: 'wrong-pin' | 'locked-out' }> {
  record.failedAttempts++
  if (record.failedAttempts >= 5) {
    record.lockedUntil = now() + 5 * 60 * 1000 // 5 minutes
  }
  storage.set(LOCK_STORAGE_KEY, JSON.stringify(record))

  if (record.lockedUntil !== null && now() < record.lockedUntil) {
    return { ok: false, reason: 'locked-out' }
  }

  return { ok: false, reason: 'wrong-pin' }
}

export async function biometricsAvailable(): Promise<boolean> {
  if (typeof PublicKeyCredential === 'undefined') return false
  try {
    return !!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.())
  } catch (e) {
    return false
  }
}

export async function encryptWithKey(key: CryptoKey, plaintext: string): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )

  return {
    iv: toBase64Url(iv.buffer),
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
