// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  encryptHealthExport,
  decryptHealthExport,
  isHealthEnvelope,
  encodeEnvelope,
  decodeEnvelope,
  isWithinDeepLinkLimit,
  envelopeHints,
  getEnvelopeHeaderAad,
  HealthEnvelopeError,
  ENVELOPE_KDF,
  MIN_EXPORT_ITERATIONS,
  MIN_ITERATIONS,
  MAX_ITERATIONS,
  MAX_ENVELOPE_BYTES,
  MAX_CIPHERTEXT_BASE64_LENGTH,
  DEEP_LINK_LIMIT_BYTES
} from './healthEncryption';
import { parseHealthFile } from './training';

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const bytesOfLen = (n: number): Uint8Array => {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = (i * 37 + 11) & 0xff;
  return a;
};

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
    const pw = 'test-pw';
    const env = await encryptHealthExport(dummyPayload, pw);
    const decrypted = await decryptHealthExport(env, pw);
    expect(decrypted).toBe(dummyPayload);
  });

  it('2. roundtrips a 100 KB payload', async () => {
    const payload = JSON.stringify({ data: 'A'.repeat(1024 * 100) });
    const pw = 'strong-pw';
    const env = await encryptHealthExport(payload, pw);
    const decrypted = await decryptHealthExport(env, pw);
    expect(decrypted).toBe(payload);
  });

  it('3. roundtrips an empty string', async () => {
    const pw = 'pass';
    const env = await encryptHealthExport('', pw);
    const decrypted = await decryptHealthExport(env, pw);
    expect(decrypted).toBe('');
  });

  it('4. throws wrong-passphrase on wrong passphrase and returns no plaintext', async () => {
    const pw = 'correct';
    const env = await encryptHealthExport(dummyPayload, pw);

    await expect(decryptHealthExport(env, 'wrong')).rejects.toMatchObject({ code: 'wrong-passphrase' });

    try {
      await decryptHealthExport(env, 'wrong');
    } catch (e: any) {
      expect(e.message).not.toContain('swal.health');
      expect(e.code).toBe('wrong-passphrase');
    }
  });

  it('5. throws wrong-passphrase on tampered ciphertext', async () => {
    const pw = 'pass';
    const env = await encryptHealthExport(dummyPayload, pw);
    const char = env.ciphertext[0];
    env.ciphertext = (char === 'A' ? 'B' : 'A') + env.ciphertext.substring(1);
    await expect(decryptHealthExport(env, pw)).rejects.toMatchObject({ code: 'wrong-passphrase' });
  });

  it('6. throws wrong-passphrase on tampered IV', async () => {
    const pw = 'pass';
    const env = await encryptHealthExport(dummyPayload, pw);
    const char = env.iv[0];
    env.iv = (char === 'A' ? 'B' : 'A') + env.iv.substring(1);
    await expect(decryptHealthExport(env, pw)).rejects.toMatchObject({ code: 'wrong-passphrase' });
  });

  it('7. produces different salt and ciphertext for two encryptions of the same plaintext', async () => {
    const pw = 'pass';
    const env1 = await encryptHealthExport(dummyPayload, pw);
    const env2 = await encryptHealthExport(dummyPayload, pw);
    expect(env1.salt).not.toBe(env2.salt);
    expect(env1.ciphertext).not.toBe(env2.ciphertext);
    expect(env1.iv).not.toBe(env2.iv);
  });

  it('8. envelope JSON does not contain marker string from plaintext', async () => {
    const pw = 'pass';
    const env = await encryptHealthExport(dummyPayload, pw);
    const encoded = encodeEnvelope(env);
    expect(encoded).not.toContain('swal.health/v1/workout-session');
    expect(encoded).not.toContain('subj_test');
  });

  it('9. enforces iterations === 600000 and kdf === PBKDF2-SHA-256 for new exports', async () => {
    const pw = 'pass';
    const env = await encryptHealthExport(dummyPayload, pw);
    expect(env.iterations).toBe(600000);
    expect(env.kdf).toBe('PBKDF2-SHA-256');
  });

  it('10. all three base64 fields match ^[A-Za-z0-9_-]+$', async () => {
    const pw = 'pass';
    const env = await encryptHealthExport(dummyPayload, pw);
    const regex = /^[A-Za-z0-9_-]+$/;
    expect(env.salt).toMatch(regex);
    expect(env.iv).toMatch(regex);
    expect(env.ciphertext).toMatch(regex);
  });

  it('11. isHealthEnvelope rejects invalid shapes and decoding plain array gives invalid-envelope', () => {
    expect(isHealthEnvelope([{ "schema": "swal.health" }])).toBe(false);
    expect(isHealthEnvelope(null)).toBe(false);
    expect(isHealthEnvelope(undefined)).toBe(false);
    expect(isHealthEnvelope(123)).toBe(false);
    expect(isHealthEnvelope("string")).toBe(false);
    expect(isHealthEnvelope({})).toBe(false);
  });

  it('12. encodeEnvelope/decodeEnvelope roundtrip with no newline', async () => {
    const pw = 'pass';
    const env = await encryptHealthExport(dummyPayload, pw);
    const encoded = encodeEnvelope(env);
    expect(encoded).not.toContain('\n');
    const decoded = decodeEnvelope(encoded);
    expect(decoded).toEqual(env);
  });

  it('13. isWithinDeepLinkLimit respects 8192 bytes limit including TextEncoder multi-byte logic', async () => {
    const pw = 'pass';
    const smallEnv = encodeEnvelope(await encryptHealthExport('A', pw));
    expect(isWithinDeepLinkLimit(smallEnv)).toBe(true);

    const exactAscii = 'A'.repeat(8192);
    expect(isWithinDeepLinkLimit(exactAscii)).toBe(true);
    const overAscii = 'A'.repeat(8193);
    expect(isWithinDeepLinkLimit(overAscii)).toBe(false);

    const multiByte = 'ñ'.repeat(4097); // 4097 * 2 = 8194 bytes
    expect(isWithinDeepLinkLimit(multiByte)).toBe(false);
  });

  it('M3. decrypts successfully even with non-default iterations (e.g. 300000) checking KAT', async () => {
    const pw = 'pass';

    const kdfKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 300000, hash: 'SHA-256' },
      kdfKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const katEnv: any = {
      v: 1, kdf: 'PBKDF2-SHA-256', iterations: 300000,
      salt: b64(salt), iv: b64(iv), ciphertext: ''
    };
    const aad = getEnvelopeHeaderAad({ v: 1, kdf: 'PBKDF2-SHA-256', iterations: 300000, salt: katEnv.salt });
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad as unknown as BufferSource },
      aesKey,
      new TextEncoder().encode("Hello")
    );
    katEnv.ciphertext = b64(ct);

    const decrypted = await decryptHealthExport(katEnv, pw);
    expect(decrypted).toBe("Hello");
  });

  it('M4. v:2 gives unsupported-version in decrypt and decode', async () => {
    const pw = 'pass';
    const env = await encryptHealthExport(dummyPayload, pw);
    (env as any).v = 2;
    await expect(decryptHealthExport(env, pw)).rejects.toMatchObject({ code: 'unsupported-version' });
    expect(() => decodeEnvelope(JSON.stringify(env))).toThrow(
      expect.objectContaining({ code: 'unsupported-version' })
    );
  });

  it('M5, M9, M10. rejects invalid salt, other kdf, iterations out of range', async () => {
    const pw = 'pass';
    const env = await encryptHealthExport(dummyPayload, pw);

    // valid base64 but invalid base64url (+ or /)
    const invalidSaltUrl = { ...env, salt: 'wB+wXo8aY9f/Q12345678w==' };
    expect(isHealthEnvelope(invalidSaltUrl)).toBe(false);

    const invalidKdf = { ...env, kdf: 'PBKDF2-SHA-512' };
    expect(isHealthEnvelope(invalidKdf)).toBe(false);

    const iterText = { ...env, iterations: "600000" };
    expect(isHealthEnvelope(iterText)).toBe(false);

    const iterLow = { ...env, iterations: 200000 };
    expect(isHealthEnvelope(iterLow)).toBe(false);

    const iterHigh = { ...env, iterations: 20000000 };
    expect(isHealthEnvelope(iterHigh)).toBe(false);

    const iterNaN = { ...env, iterations: NaN };
    expect(isHealthEnvelope(iterNaN)).toBe(false);
  });

  it('S1. rejects sizes that are too small (1 byte salt, 8 bytes IV, 4 bytes ciphertext)', async () => {
    const pw = 'pass';
    const env = await encryptHealthExport(dummyPayload, pw);

    const smallSalt = { ...env, salt: 'QQ' }; // 1 byte
    expect(isHealthEnvelope(smallSalt)).toBe(false);

    const smallIv = { ...env, iv: 'AAAAAAAAAAA' }; // 8 bytes
    expect(isHealthEnvelope(smallIv)).toBe(false);

    const smallCt = { ...env, ciphertext: 'AAAAAA' }; // 4 bytes
    expect(isHealthEnvelope(smallCt)).toBe(false);
  });

  it('M12. decodeEnvelope("{}"), a plain array, and invalid JSON give invalid-envelope', () => {
    expect(() => decodeEnvelope('{}')).toThrow(expect.objectContaining({ code: 'invalid-envelope' }));
    expect(() => decodeEnvelope('[]')).toThrow(expect.objectContaining({ code: 'invalid-envelope' }));
    expect(() => decodeEnvelope('invalid json')).toThrow(expect.objectContaining({ code: 'invalid-envelope' }));
  });

  it('compatibility test: parseHealthFile throws on envelope', async () => {
    const pw = 'pass';
    const env = await encryptHealthExport(dummyPayload, pw);
    expect(() => parseHealthFile(encodeEnvelope(env))).toThrow();
  });

  it('rejects an empty passphrase in encryptHealthExport', async () => {
    await expect(encryptHealthExport(dummyPayload, '')).rejects.toMatchObject({ code: 'invalid-envelope' });
  });

  it('write path derives with at least MIN_EXPORT_ITERATIONS (600000) and records it', async () => {
    expect(MIN_EXPORT_ITERATIONS).toBe(600000);
    expect(ENVELOPE_KDF.iterations).toBe(MIN_EXPORT_ITERATIONS);
    expect(ENVELOPE_KDF.iterations).toBeGreaterThanOrEqual(600000);
    const env = await encryptHealthExport(dummyPayload, 'pass');
    expect(env.iterations).toBeGreaterThanOrEqual(600000);
    expect(env.iterations).toBe(MIN_EXPORT_ITERATIONS);
  });

  it('M5b. accepts iterations exactly at the read floor/ceiling and rejects just outside (kills boundary mutants)', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    // exactly at the floor/ceiling is accepted
    expect(isHealthEnvelope({ ...env, iterations: MIN_ITERATIONS })).toBe(true);
    expect(isHealthEnvelope({ ...env, iterations: MAX_ITERATIONS })).toBe(true);
    // one below the floor / one above the ceiling is rejected
    expect(isHealthEnvelope({ ...env, iterations: MIN_ITERATIONS - 1 })).toBe(false);
    expect(isHealthEnvelope({ ...env, iterations: MAX_ITERATIONS + 1 })).toBe(false);
  });

  it('S1b. enforces exact salt/iv sizes and the tag-size floor, rejecting oversized fields too', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    // exact sizes accepted
    expect(isHealthEnvelope({ ...env, salt: b64url(bytesOfLen(16)) })).toBe(true);
    expect(isHealthEnvelope({ ...env, iv: b64url(bytesOfLen(12)) })).toBe(true);
    expect(isHealthEnvelope({ ...env, ciphertext: b64url(bytesOfLen(16)) })).toBe(true);
    // oversized salt/iv rejected (kills a mutant relaxing the exact-size check to a minimum)
    expect(isHealthEnvelope({ ...env, salt: b64url(bytesOfLen(17)) })).toBe(false);
    expect(isHealthEnvelope({ ...env, iv: b64url(bytesOfLen(13)) })).toBe(false);
    // ciphertext shorter than the 16-byte GCM tag rejected
    expect(isHealthEnvelope({ ...env, ciphertext: b64url(bytesOfLen(15)) })).toBe(false);
  });

  it('version: accepts a v:1 envelope and rejects a missing/absent version', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    expect(isHealthEnvelope(env)).toBe(true);
    const noV: any = { ...env };
    delete noV.v;
    expect(isHealthEnvelope(noV)).toBe(false);
  });

  it('rejects an empty passphrase in decryptHealthExport', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    await expect(decryptHealthExport(env, '')).rejects.toMatchObject({ code: 'invalid-envelope' });
  });

  it('envelopeHints are bilingual and state the security model and size limit', () => {
    const hints = envelopeHints();
    expect(hints.length).toBeGreaterThan(0);
    for (const h of hints) {
      expect(typeof h.es).toBe('string');
      expect(typeof h.en).toBe('string');
      expect(h.es.length).toBeGreaterThan(0);
      expect(h.en.length).toBeGreaterThan(0);
    }
    const joined = hints.map((h) => `${h.es} ${h.en}`).join(' ');
    expect(joined).toContain(MIN_EXPORT_ITERATIONS.toLocaleString('en-US'));
    expect(joined.toLowerCase()).toContain('aes-gcm');
    expect(joined.toLowerCase()).toContain('pbkdf2');
    expect(joined).toContain(String(DEEP_LINK_LIMIT_BYTES));
  });

  // ==========================================
  // BLOQUEANTE 1: Tamaño límite antes de parsear/derivar
  // ==========================================

  it('B1. decodeEnvelope rejects text exceeding MAX_ENVELOPE_BYTES (limit + 1) before JSON.parse', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    const validJson = encodeEnvelope(env);
    // Valid JSON padded with spaces to limit + 1
    const overLimitJson = validJson + ' '.repeat(MAX_ENVELOPE_BYTES + 1 - validJson.length);
    expect(overLimitJson.length).toBe(MAX_ENVELOPE_BYTES + 1);

    expect(() => decodeEnvelope(overLimitJson)).toThrow(
      expect.objectContaining({ name: 'HealthEnvelopeError', code: 'invalid-envelope' })
    );

    const plainOver = ' '.repeat(MAX_ENVELOPE_BYTES + 1);
    expect(() => decodeEnvelope(plainOver)).toThrow(
      expect.objectContaining({ name: 'HealthEnvelopeError', code: 'invalid-envelope' })
    );
  });

  it('B1. decodeEnvelope accepts text exactly at MAX_ENVELOPE_BYTES border', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    const validJson = encodeEnvelope(env);
    const exactJson = validJson + ' '.repeat(MAX_ENVELOPE_BYTES - validJson.length);
    expect(exactJson.length).toBe(MAX_ENVELOPE_BYTES);

    const decoded = decodeEnvelope(exactJson);
    expect(decoded).toEqual(env);
  });

  it('B1. isHealthEnvelope and decryptHealthExport reject ciphertext exceeding ceil(MAX*4/3) (limit + 1) before base64 decode and KDF', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    const maxCtLen = MAX_CIPHERTEXT_BASE64_LENGTH;
    expect(maxCtLen).toBe(Math.ceil((MAX_ENVELOPE_BYTES * 4) / 3));

    // limit + 1 characters
    const overCiphertext = 'A'.repeat(maxCtLen + 1);
    const overEnv = { ...env, ciphertext: overCiphertext };

    expect(isHealthEnvelope(overEnv)).toBe(false);
    await expect(decryptHealthExport(overEnv, 'pass')).rejects.toMatchObject({
      name: 'HealthEnvelopeError',
      code: 'invalid-envelope'
    });
  });

  it('B1. isHealthEnvelope accepts ciphertext exactly at ceil(MAX*4/3) border', async () => {
    const env = await encryptHealthExport(dummyPayload, 'pass');
    const maxCtLen = MAX_CIPHERTEXT_BASE64_LENGTH;
    const exactCiphertext = 'A'.repeat(maxCtLen);
    const exactEnv = { ...env, ciphertext: exactCiphertext };

    expect(isHealthEnvelope(exactEnv)).toBe(true);
  });

  // ==========================================
  // BLOQUEANTE 2: Normalización NFKC de frase
  // ==========================================

  it('B2. normalizes passphrase using NFKC for NFC vs NFD equivalence', async () => {
    const nfcPass = 'caf\u00e9'; // composed NFC (5 bytes UTF-8)
    const nfdPass = 'cafe\u0301'; // decomposed NFD (6 bytes UTF-8)
    expect(nfcPass).not.toBe(nfdPass);
    expect(nfcPass.normalize('NFKC')).toBe(nfdPass.normalize('NFKC'));

    const envNfc = await encryptHealthExport(dummyPayload, nfcPass);
    const decryptedWithNfd = await decryptHealthExport(envNfc, nfdPass);
    expect(decryptedWithNfd).toBe(dummyPayload);

    const envNfd = await encryptHealthExport(dummyPayload, nfdPass);
    const decryptedWithNfc = await decryptHealthExport(envNfd, nfcPass);
    expect(decryptedWithNfc).toBe(dummyPayload);
  });

  it('B2. normalizes full-width passphrase to standard ASCII equivalents', async () => {
    const fullWidth = '\uff50\uff41\uff53\uff53'; // 'ｐａｓｓ'
    const standard = 'pass';
    expect(fullWidth).not.toBe(standard);
    expect(fullWidth.normalize('NFKC')).toBe(standard);

    const envFull = await encryptHealthExport(dummyPayload, fullWidth);
    const decryptedWithStd = await decryptHealthExport(envFull, standard);
    expect(decryptedWithStd).toBe(dummyPayload);

    const envStd = await encryptHealthExport(dummyPayload, standard);
    const decryptedWithFull = await decryptHealthExport(envStd, fullWidth);
    expect(decryptedWithFull).toBe(dummyPayload);
  });

  it('B2. rejects empty passphrase after NFKC normalization', async () => {
    await expect(encryptHealthExport(dummyPayload, '')).rejects.toMatchObject({ code: 'invalid-envelope' });
    const env = await encryptHealthExport(dummyPayload, 'pass');
    await expect(decryptHealthExport(env, '')).rejects.toMatchObject({ code: 'invalid-envelope' });
  });

  // ==========================================
  // NO BLOQUEANTES: AAD, tampering, encrypt-failed, json check
  // ==========================================

  it('NB-a. binds header metadata to ciphertext via AAD (tampered AAD fails decryption)', async () => {
    const pw = 'pass';
    const kdfKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(pw.normalize('NFKC')),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
      kdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const b64 = (buf: ArrayBuffer | Uint8Array) =>
      btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // Encrypt with mismatched AAD
    const dummyAad = new TextEncoder().encode('other-aad');
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: dummyAad as unknown as BufferSource },
      aesKey,
      new TextEncoder().encode("Hello")
    );
    const badAadEnv: any = {
      v: 1,
      kdf: 'PBKDF2-SHA-256',
      iterations: 600000,
      salt: b64(salt),
      iv: b64(iv),
      ciphertext: b64(ct)
    };

    await expect(decryptHealthExport(badAadEnv, pw)).rejects.toMatchObject({ code: 'wrong-passphrase' });
  });

  it('NB-b. altering iterations or salt gives wrong-passphrase', async () => {
    const pw = 'pass';
    const env = await encryptHealthExport(dummyPayload, pw);

    // Alter iterations to another valid number
    const tamperedIterations = { ...env, iterations: 500000 };
    await expect(decryptHealthExport(tamperedIterations, pw)).rejects.toMatchObject({ code: 'wrong-passphrase' });

    // Alter salt to another valid 16-byte salt
    const otherSalt = b64url(bytesOfLen(16));
    expect(otherSalt).not.toBe(env.salt);
    const tamperedSalt = { ...env, salt: otherSalt };
    await expect(decryptHealthExport(tamperedSalt, pw)).rejects.toMatchObject({ code: 'wrong-passphrase' });
  });

  it('NB-c. throws encrypt-failed with HealthEnvelopeError when encryption fails', async () => {
    const spy = vi.spyOn(crypto.subtle, 'encrypt').mockRejectedValueOnce(new Error('Subtle encryption error'));
    let thrownError: unknown;
    try {
      await encryptHealthExport(dummyPayload, 'pass');
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeInstanceOf(HealthEnvelopeError);
    expect((thrownError as HealthEnvelopeError).code).toBe('encrypt-failed');
    spy.mockRestore();
  });

  it('NB-d. rejects non-string json payloads in encryptHealthExport', async () => {
    await expect(encryptHealthExport(undefined as any, 'pass')).rejects.toMatchObject({ code: 'invalid-envelope' });
    await expect(encryptHealthExport(null as any, 'pass')).rejects.toMatchObject({ code: 'invalid-envelope' });
    await expect(encryptHealthExport(12345 as any, 'pass')).rejects.toMatchObject({ code: 'invalid-envelope' });
    await expect(encryptHealthExport({} as any, 'pass')).rejects.toMatchObject({ code: 'invalid-envelope' });
  });
});
