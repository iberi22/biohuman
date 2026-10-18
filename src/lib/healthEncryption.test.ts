// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  ENVELOPE_VERSION,
  ENVELOPE_KDF,
  DEEP_LINK_LIMIT_BYTES,
  HealthEnvelopeError,
  encryptHealthExport,
  decryptHealthExport,
  isHealthEnvelope,
  encodeEnvelope,
  decodeEnvelope,
  isWithinDeepLinkLimit
} from './healthEncryption';

describe('healthEncryption', () => {
  const dummyPayload = JSON.stringify([{
    "schema": "swal.health/v1/workout-session",
    "id": "01J00000000000000000000000",
    "subject": "subj_test",
    "createdAt": "2026-01-01T00:00:00Z",
    "source": { "app": "training", "version": "0.1.0" },
    "gosDataset": "0.0.0+sha256:0000000000000000000000000000000000000000000000000000000000000000",
    "data": {
      "startedAt": "2026-01-01T00:00:00Z",
      "endedAt": "2026-01-01T00:45:00Z",
      "routineId": "starter-full-body",
      "exercises": []
    }
  }]);

  it('1. roundtrips a small .swalhealth.json-like array', async () => {
    const passphrase = 'test-passphrase';
    const env = await encryptHealthExport(dummyPayload, passphrase);
    const decrypted = await decryptHealthExport(env, passphrase);
    expect(decrypted).toBe(dummyPayload);
  });

  it('2. roundtrips a 100 KB payload', async () => {
    const payload = JSON.stringify({ data: 'A'.repeat(1024 * 100) });
    const passphrase = 'strong-passphrase';
    const env = await encryptHealthExport(payload, passphrase);
    const decrypted = await decryptHealthExport(env, passphrase);
    expect(decrypted).toBe(payload);
  });

  it('3. roundtrips an empty string', async () => {
    const passphrase = 'pass';
    const env = await encryptHealthExport('', passphrase);
    const decrypted = await decryptHealthExport(env, passphrase);
    expect(decrypted).toBe('');
  });

  it('4. throws wrong-passphrase / tampered on wrong passphrase and returns no plaintext', async () => {
    const passphrase = 'correct';
    const env = await encryptHealthExport(dummyPayload, passphrase);

    await expect(decryptHealthExport(env, 'wrong')).rejects.toThrowError(
      new HealthEnvelopeError('Decryption failed. Wrong passphrase or tampered ciphertext.', 'tampered')
    );

    // Explicitly test that thrown error leaks no plaintext
    try {
      await decryptHealthExport(env, 'wrong');
    } catch (e: any) {
      expect(e.message).not.toContain('swal.health');
      expect(e.code).toBe('tampered');
    }
  });

  it('5. throws tampered on tampered ciphertext', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    // Modify one char of base64 ciphertext
    const char = env.ciphertext[0];
    env.ciphertext = (char === 'A' ? 'B' : 'A') + env.ciphertext.substring(1);
    await expect(decryptHealthExport(env, 'pass')).rejects.toThrowError(
      new HealthEnvelopeError('Decryption failed. Wrong passphrase or tampered ciphertext.', 'tampered')
    );
  });

  it('6. throws tampered on tampered IV', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    env.iv = env.iv.substring(0, env.iv.length - 1) + (env.iv.endsWith('A') ? 'B' : 'A');
    await expect(decryptHealthExport(env, 'pass')).rejects.toThrowError(
      new HealthEnvelopeError('Decryption failed. Wrong passphrase or tampered ciphertext.', 'tampered')
    );
  });

  it('7. produces different salt and ciphertext for two encryptions of the same plaintext', async () => {
    const env1 = await encryptHealthExport(dummyPayload, 'pass');
    const env2 = await encryptHealthExport(dummyPayload, 'pass');
    expect(env1.salt).not.toBe(env2.salt);
    expect(env1.ciphertext).not.toBe(env2.ciphertext);
    expect(env1.iv).not.toBe(env2.iv);
  });

  it('8. envelope JSON does not contain marker string from plaintext', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    const encoded = encodeEnvelope(env);
    expect(encoded).not.toContain('swal.health/v1/workout-session');
    expect(encoded).not.toContain('subj_test');
  });

  it('9. enforces iterations >= 210000 and kdf === PBKDF2-SHA-256', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    expect(env.iterations).toBeGreaterThanOrEqual(210000);
    expect(env.kdf).toBe('PBKDF2-SHA-256');
  });

  it('10. all three base64 fields match ^[A-Za-z0-9_-]+$', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    const regex = /^[A-Za-z0-9_-]+$/;
    expect(env.salt).toMatch(regex);
    expect(env.iv).toMatch(regex);
    expect(env.ciphertext).toMatch(regex);
  });

  it('11. isHealthEnvelope rejects invalid shapes', () => {
    expect(isHealthEnvelope([{ "schema": "swal.health" }])).toBe(false);
    expect(isHealthEnvelope(null)).toBe(false);
    expect(isHealthEnvelope({})).toBe(false);
    expect(isHealthEnvelope({ v: 2, kdf: 'PBKDF2-SHA-256', iterations: 210000, salt: 'A', iv: 'A', ciphertext: 'A' })).toBe(false);

    // missing iv
    expect(isHealthEnvelope({ v: 1, kdf: 'PBKDF2-SHA-256', iterations: 210000, salt: 'A', ciphertext: 'A' })).toBe(false);
  });

  it('12. encodeEnvelope/decodeEnvelope roundtrip with no newline', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    const encoded = encodeEnvelope(env);
    expect(encoded).not.toContain('\n');
    const decoded = decodeEnvelope(encoded);
    expect(decoded).toEqual(env);
  });

  it('13. isWithinDeepLinkLimit respects 8192 bytes limit', async () => {
    const smallEnv = encodeEnvelope(await encryptHealthExport('A', 'pass'));
    expect(isWithinDeepLinkLimit(smallEnv)).toBe(true);

    const largePayload = JSON.stringify({ data: 'A'.repeat(1024 * 100) });
    const largeEnv = encodeEnvelope(await encryptHealthExport(largePayload, 'pass'));
    expect(isWithinDeepLinkLimit(largeEnv)).toBe(false);
  });
});
