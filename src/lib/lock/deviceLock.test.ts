// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { setupPin, unlock, encryptWithKey, decryptWithKey, biometricsAvailable, LOCK_STORAGE_KEY, LOCK_KDF } from './deviceLock'

class MemoryStorage {
  private store = new Map<string, string>()
  get(key: string) { return this.store.get(key) || null }
  set(key: string, value: string) { this.store.set(key, value) }
  remove(key: string) { this.store.delete(key) }
}

describe('deviceLock', () => {
  it('setupPin rejects a 4-digit PIN and a non-numeric PIN', async () => {
    const storage = new MemoryStorage()
    await expect(setupPin('1234', storage)).rejects.toThrow('PIN must be 6 to 12 digits')
    await expect(setupPin('abcdef', storage)).rejects.toThrow('PIN must be 6 to 12 digits')
    await expect(setupPin('12345a', storage)).rejects.toThrow('PIN must be 6 to 12 digits')
  })

  it('rejects 13 digits and alphanumeric, accepts 6 and 12', async () => {
    const storage = new MemoryStorage()
    await expect(setupPin('1234567890123', storage)).rejects.toThrow()
    await expect(setupPin('a123456', storage)).rejects.toThrow()

    // Accept 6
    const r1 = await setupPin('123456', storage)
    expect(r1).toBeDefined()

    // Accept 12
    const r2 = await setupPin('123456789012', storage)
    expect(r2).toBeDefined()
  })

  it('the stored record does not contain the PIN', async () => {
    const storage = new MemoryStorage()
    const pin = '123456'
    const record = await setupPin(pin, storage)
    expect(JSON.stringify(record)).not.toContain(pin)
  })

  it('two setups produce different salts', async () => {
    const s1 = new MemoryStorage()
    const s2 = new MemoryStorage()
    const r1 = await setupPin('123456', s1)
    const r2 = await setupPin('123456', s2)
    expect(r1.salt).not.toBe(r2.salt)
  })

  it('the verifier is not the salt and not derivable by string concatenation', async () => {
    const storage = new MemoryStorage()
    const record = await setupPin('123456', storage)
    expect(record.verifier).not.toBe(record.salt)
    expect(record.verifier).not.toContain(record.salt)
    expect(record.salt).not.toContain(record.verifier)
  })

  it('unlock with the right PIN returns ok: true and a CryptoKey whose algorithm is AES-GCM', async () => {
    const storage = new MemoryStorage()
    await setupPin('123456', storage)
    const result = await unlock('123456', storage)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.key).toBeInstanceOf(CryptoKey)
      expect(result.key.algorithm.name).toBe('AES-GCM')
      expect(result.key.extractable).toBe(false)
    }
  })

  it('unlock with a wrong PIN returns wrong-pin and increments failedAttempts', async () => {
    const storage = new MemoryStorage()
    await setupPin('123456', storage)
    const result = await unlock('654321', storage)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('wrong-pin')
    }
    const record = JSON.parse(storage.get(LOCK_STORAGE_KEY)!)
    expect(record.failedAttempts).toBe(1)
  })

  it('five wrong attempts set lockedUntil and the sixth call returns locked-out even with the right PIN', async () => {
    const storage = new MemoryStorage()
    let time = 1000000
    const now = () => time
    await setupPin('123456', storage) // setupPin doesn't use 'now' anymore, but that's fine

    // 1 to 4 wrong attempts
    for (let i = 0; i < 4; i++) {
      const res = await unlock('111111', storage, now)
      expect(res.ok).toBe(false)
      // @ts-ignore
      expect(res.reason).toBe('wrong-pin')
    }

    // 5th wrong attempt triggers lockout for future attempts, but itself returns wrong-pin
    const res5 = await unlock('111111', storage, now)
    expect(res5.ok).toBe(false)
    // @ts-ignore
    expect(res5.reason).toBe('wrong-pin')

    // 6th attempt with the RIGHT pin still locked out
    const res6 = await unlock('123456', storage, now)
    expect(res6.ok).toBe(false)
    // @ts-ignore
    expect(res6.reason).toBe('locked-out')
  })

  it('exact lockout duration check (lockedUntil === now + 300000 and 1ms before deadline is locked-out)', async () => {
    const storage = new MemoryStorage()
    let time = 1000000
    const now = () => time
    await setupPin('123456', storage)

    for (let i = 0; i < 5; i++) {
      await unlock('111111', storage, now)
    }

    const record = JSON.parse(storage.get(LOCK_STORAGE_KEY)!)
    expect(record.lockedUntil).toBe(time + 300000)

    // 1 ms before deadline
    time = record.lockedUntil - 1
    const almostRes = await unlock('123456', storage, now)
    expect(almostRes.ok).toBe(false)
    // @ts-ignore
    expect(almostRes.reason).toBe('locked-out')

    // At deadline
    time = record.lockedUntil
    const exactRes = await unlock('123456', storage, now)
    expect(exactRes.ok).toBe(true)
  })

  it('after the deadline (injected now) the right PIN works again and the counter resets', async () => {
    const storage = new MemoryStorage()
    let time = 1000000
    const now = () => time
    await setupPin('123456', storage)

    for (let i = 0; i < 5; i++) {
      await unlock('111111', storage, now)
    }

    // locked out now
    const lockedRes = await unlock('123456', storage, now)
    expect(lockedRes.ok).toBe(false)
    // @ts-ignore
    expect(lockedRes.reason).toBe('locked-out')

    // advance time
    time += 5 * 60 * 1000 + 1

    // now it works
    const okRes = await unlock('123456', storage, now)
    expect(okRes.ok).toBe(true)

    const record = JSON.parse(storage.get(LOCK_STORAGE_KEY)!)
    expect(record.failedAttempts).toBe(0)
    expect(record.lockedUntil).toBeNull()
  })

  it('iterations >= 210000 and kdf === PBKDF2-SHA-256', async () => {
    const storage = new MemoryStorage()
    const record = await setupPin('123456', storage)
    expect(record.iterations).toBeGreaterThanOrEqual(210000)
    expect(record.iterations).toBe(LOCK_KDF.iterations)
    expect(record.kdf).toBe('PBKDF2-SHA-256')
  })

  it('biometricsAvailable() is false when the platform API is absent and true when a fake returns true', async () => {
    // API is initially absent in node
    expect(await biometricsAvailable()).toBe(false)

    // Mock the API
    const globalAny = globalThis as any

    // Fake throws
    globalAny.PublicKeyCredential = {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => { throw new Error('fake error') }
    }
    expect(await biometricsAvailable()).toBe(false)

    // Fake missing method
    globalAny.PublicKeyCredential = {}
    expect(await biometricsAvailable()).toBe(false)

    // Fake returns true
    globalAny.PublicKeyCredential = {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true
    }
    expect(await biometricsAvailable()).toBe(true)

    delete globalAny.PublicKeyCredential
  })

  it('encryptWithKey/decryptWithKey roundtrip a 100 KB string', async () => {
    const storage = new MemoryStorage()
    await setupPin('123456', storage)
    const result = await unlock('123456', storage)
    expect(result.ok).toBe(true)
    // @ts-ignore
    const key = result.key

    // 100 KB string
    const largeString = 'a'.repeat(100 * 1024)
    const encrypted = await encryptWithKey(key, largeString)
    const decrypted = await decryptWithKey(key, encrypted)

    expect(decrypted).toBe(largeString)
  })

  it('decryptWithKey throws on a tampered ciphertext (GCM authentication) byte level', async () => {
    const storage = new MemoryStorage()
    await setupPin('123456', storage)
    const result = await unlock('123456', storage)
    expect(result.ok).toBe(true)
    // @ts-ignore
    const key = result.key

    const encrypted = await encryptWithKey(key, 'hello world')

    // Tamper with byte array
    function base64urlToBytes(b64u: string) {
      const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/')
      const pad = b64.length % 4
      const b64p = pad ? b64 + '='.repeat(4 - pad) : b64
      return Uint8Array.from(atob(b64p), c => c.charCodeAt(0))
    }
    function bytesToBase64url(bytes: Uint8Array) {
      return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    }

    const ctBytes = base64urlToBytes(encrypted.ciphertext)
    ctBytes[0] ^= 1 // Tamper the first byte

    const tamperedCiphertext = bytesToBase64url(ctBytes)

    await expect(decryptWithKey(key, { ...encrypted, ciphertext: tamperedCiphertext })).rejects.toThrow()
  })

  it('M1 IV fixed to zeros (two encryptions of the same text give different IV and ciphertext, IV is 12 bytes)', async () => {
    const storage = new MemoryStorage()
    await setupPin('123456', storage)
    const res = await unlock('123456', storage)
    // @ts-ignore
    const key = res.key

    const e1 = await encryptWithKey(key, 'test')
    const e2 = await encryptWithKey(key, 'test')

    expect(e1.iv).not.toBe(e2.iv)
    expect(e1.ciphertext).not.toBe(e2.ciphertext)

    // Check IV is 12 bytes
    const b64 = e1.iv.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    const b64p = pad ? b64 + '='.repeat(4 - pad) : b64
    const ivBytesLength = atob(b64p).length
    expect(ivBytesLength).toBe(12)
  })

  it('M8 returned key depends on salt (encrypt with key from one setup, decrypt with key from another fails)', async () => {
    const s1 = new MemoryStorage()
    const s2 = new MemoryStorage()
    await setupPin('123456', s1)
    await setupPin('123456', s2)

    const res1 = await unlock('123456', s1)
    const res2 = await unlock('123456', s2)
    // @ts-ignore
    const key1 = res1.key
    // @ts-ignore
    const key2 = res2.key

    const encrypted = await encryptWithKey(key1, 'hello')
    await expect(decryptWithKey(key2, encrypted)).rejects.toThrow()
  })

  it('M9 verifier ignores salt (same PIN in two setups gives different verifiers)', async () => {
    const s1 = new MemoryStorage()
    const s2 = new MemoryStorage()
    const r1 = await setupPin('123456', s1)
    const r2 = await setupPin('123456', s2)

    expect(r1.verifier).not.toBe(r2.verifier)
  })

  it('20 concurrent unlocks cannot try more than 5 PINs', async () => {
    const storage = new MemoryStorage()
    await setupPin('123456', storage)

    const promises = []
    for (let i = 0; i < 20; i++) {
      promises.push(unlock('111111', storage))
    }

    const results = await Promise.all(promises)
    const lockouts = results.filter(r => r.ok === false && r.reason === 'locked-out')

    // Depending on execution order and microtasks, at most 5 attempts will be recorded as wrong-pin,
    // the rest should be locked-out. Wait, the requirement says "cannot try more than 5 PINs".
    // That means failedAttempts should be exactly 5, and the rest get lockout (or the state ends up correctly locked out).

    const record = JSON.parse(storage.get(LOCK_STORAGE_KEY)!)
    expect(record.failedAttempts).toBe(5)
    expect(record.lockedUntil).not.toBeNull()
  })

  it('iterations < 210000 rejected', async () => {
    const storage = new MemoryStorage()
    const record = await setupPin('123456', storage)

    // Manually corrupt the record
    record.iterations = 200000
    storage.set(LOCK_STORAGE_KEY, JSON.stringify(record))

    await expect(unlock('123456', storage)).rejects.toThrow('Corrupt lock record')
  })

  it('corrupt record throws typed error', async () => {
    const storage = new MemoryStorage()
    await setupPin('123456', storage)

    storage.set(LOCK_STORAGE_KEY, 'invalid json')
    await expect(unlock('123456', storage)).rejects.toThrow('Corrupt lock record')

    const record = await setupPin('123456', storage)
    // modify a required field
    // @ts-ignore
    delete record.v
    storage.set(LOCK_STORAGE_KEY, JSON.stringify(record))
    await expect(unlock('123456', storage)).rejects.toThrow('Corrupt lock record')
  })
})
