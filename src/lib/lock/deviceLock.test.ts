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
    await setupPin('123456', storage, now)

    // 1 to 4 wrong attempts
    for (let i = 0; i < 4; i++) {
      const res = await unlock('111111', storage, now)
      expect(res.ok).toBe(false)
      // @ts-ignore
      expect(res.reason).toBe('wrong-pin')
    }

    // 5th wrong attempt triggers lockout
    const res5 = await unlock('111111', storage, now)
    expect(res5.ok).toBe(false)
    // @ts-ignore
    expect(res5.reason).toBe('locked-out')

    // 6th attempt with the RIGHT pin still locked out
    const res6 = await unlock('123456', storage, now)
    expect(res6.ok).toBe(false)
    // @ts-ignore
    expect(res6.reason).toBe('locked-out')
  })

  it('after the deadline (injected now) the right PIN works again and the counter resets', async () => {
    const storage = new MemoryStorage()
    let time = 1000000
    const now = () => time
    await setupPin('123456', storage, now)

    for (let i = 0; i < 5; i++) {
      await unlock('111111', storage, now)
    }

    // locked out now
    const lockedRes = await unlock('123456', storage, now)
    expect(lockedRes.ok).toBe(false)
    // @ts-ignore
    expect(lockedRes.reason).toBe('locked-out')

    // advance time by 5 minutes + 1 ms
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

  it('decryptWithKey throws on a tampered ciphertext (GCM authentication)', async () => {
    const storage = new MemoryStorage()
    await setupPin('123456', storage)
    const result = await unlock('123456', storage)
    expect(result.ok).toBe(true)
    // @ts-ignore
    const key = result.key

    const encrypted = await encryptWithKey(key, 'secret message')

    // Tamper with the ciphertext (change the last character in base64url)
    const tamperedCiphertext = encrypted.ciphertext.substring(0, encrypted.ciphertext.length - 1) +
      (encrypted.ciphertext.endsWith('a') ? 'b' : 'a')

    await expect(decryptWithKey(key, { ...encrypted, ciphertext: tamperedCiphertext })).rejects.toThrow()
  })
})
