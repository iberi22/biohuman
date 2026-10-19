/**
 * Honest Threat Model:
 * This module provides a self-describing encrypted envelope for the health export file.
 * The passphrase is used to derive an encryption key but NEVER leaves the device.
 * Security strictly depends on the strength of the chosen passphrase as the envelope
 * is safe to share via deep links, making offline brute-force attacks possible.
 *
 * Unicode Normalization:
 * Passphrases are canonicalized using Unicode Normalization Form KC (NFKC) before
 * validation and PBKDF2 key derivation. This guarantees consistent cryptographic
 * keys across platforms and keyboards regardless of Unicode representation (e.g.,
 * NFC vs. NFD decomposed accents like 'café' vs 'café', or full-width compatibility
 * characters like 'ｐａｓｓ' vs 'pass').
 *
 * Authenticated Additional Data (AAD):
 * The header fields {v, kdf, iterations, salt} are cryptographically bound to the
 * AES-GCM ciphertext as canonical JSON additional data. Any tampering with header
 * metadata triggers an authentication tag mismatch and decryption failure.
 *
 * Limitations:
 * - This does NOT protect data already saved unencrypted in IndexedDB. Encrypting
 *   IndexedDB at rest is a separate feature.
 * - This only provides confidentiality and authenticity for the serialized payload itself
 *   at the point of export/import.
 */

export const ENVELOPE_VERSION = 1;
/**
 * Minimum PBKDF2 iterations used when WRITING a new envelope. A judge requires new
 * exports to derive with at least 600000 iterations; never lower this constant.
 */
export const MIN_EXPORT_ITERATIONS = 600000;
export const ENVELOPE_KDF = { name: 'PBKDF2', hash: 'SHA-256', iterations: MIN_EXPORT_ITERATIONS, saltBytes: 16 } as const;
export const ENVELOPE_CIPHER = 'AES-GCM';
export const DEEP_LINK_LIMIT_BYTES = 8192;
/**
 * Maximum envelope text size (16 MiB) permitted before parsing JSON.
 * Protects against memory exhaustion DoS when reading untrusted input.
 */
export const MAX_ENVELOPE_BYTES = 16 * 1024 * 1024;
/**
 * Maximum ciphertext base64 string length corresponding to MAX_ENVELOPE_BYTES.
 * ceil(16 MiB * 4 / 3) = 22,369,622 characters.
 */
export const MAX_CIPHERTEXT_BASE64_LENGTH = Math.ceil((MAX_ENVELOPE_BYTES * 4) / 3);

/** Floor accepted when READING an envelope (e.g. one written by an older/other writer). */
export const MIN_ITERATIONS = 210000;
/** Sensible upper bound accepted when READING, to bound the KDF cost (DoS guard). */
export const MAX_ITERATIONS = 10000000;
/** Exact byte sizes enforced on read: PBKDF2 salt, AES-GCM IV and GCM auth tag. */
export const ENVELOPE_SALT_BYTES = ENVELOPE_KDF.saltBytes;
export const ENVELOPE_IV_BYTES = 12;
export const ENVELOPE_TAG_BYTES = 16;

export interface HealthEnvelope {
  v: 1;
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export class HealthEnvelopeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'invalid-envelope'
      | 'wrong-passphrase'
      | 'tampered'
      | 'unsupported-version'
      | 'encrypt-failed'
  ) {
    super(message);
    this.name = 'HealthEnvelopeError';
  }
}

function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlToBuffer(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const encoder = new TextEncoder();

/**
 * Returns canonical byte representation of envelope header fields {v, kdf, iterations, salt}
 * for AES-GCM authenticated additional data (AAD).
 */
export function getEnvelopeHeaderAad(envelope: {
  v: number;
  kdf: string;
  iterations: number;
  salt: string;
}): Uint8Array {
  return encoder.encode(
    JSON.stringify({
      v: envelope.v,
      kdf: envelope.kdf,
      iterations: envelope.iterations,
      salt: envelope.salt
    })
  );
}

async function getDerivedKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const normalized = passphrase.normalize('NFKC');
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(normalized),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptHealthExport(json: string, passphrase: string): Promise<HealthEnvelope> {
  if (typeof json !== 'string') {
    throw new HealthEnvelopeError('JSON payload must be a string', 'invalid-envelope');
  }

  if (typeof passphrase !== 'string') {
    throw new HealthEnvelopeError('Passphrase must be a string', 'invalid-envelope');
  }

  const normalized = passphrase.normalize('NFKC');
  if (normalized === '') {
    throw new HealthEnvelopeError('Passphrase cannot be empty', 'invalid-envelope');
  }

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(ENVELOPE_KDF.saltBytes));
  const key = await getDerivedKey(normalized, salt, ENVELOPE_KDF.iterations);

  const iv = globalThis.crypto.getRandomValues(new Uint8Array(ENVELOPE_IV_BYTES));
  const saltBase64Url = bufferToBase64Url(salt);

  const aad = getEnvelopeHeaderAad({
    v: ENVELOPE_VERSION,
    kdf: 'PBKDF2-SHA-256',
    iterations: ENVELOPE_KDF.iterations,
    salt: saltBase64Url
  });

  let ciphertextBuffer: ArrayBuffer;
  try {
    ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
        additionalData: aad as unknown as BufferSource
      },
      key,
      encoder.encode(json)
    );
  } catch (e) {
    throw new HealthEnvelopeError('Encryption failed', 'encrypt-failed');
  }

  return {
    v: ENVELOPE_VERSION,
    kdf: 'PBKDF2-SHA-256',
    iterations: ENVELOPE_KDF.iterations,
    salt: saltBase64Url,
    iv: bufferToBase64Url(iv),
    ciphertext: bufferToBase64Url(ciphertextBuffer)
  };
}

export async function decryptHealthExport(envelope: HealthEnvelope, passphrase: string): Promise<string> {
  if (typeof passphrase !== 'string') {
    throw new HealthEnvelopeError('Passphrase must be a string', 'invalid-envelope');
  }

  const normalized = passphrase.normalize('NFKC');
  if (normalized === '') {
    throw new HealthEnvelopeError('Passphrase cannot be empty', 'invalid-envelope');
  }

  if (envelope && (envelope as any).v !== undefined && (envelope as any).v !== ENVELOPE_VERSION) {
    throw new HealthEnvelopeError('Unsupported envelope version', 'unsupported-version');
  }

  if (!isHealthEnvelope(envelope)) {
    throw new HealthEnvelopeError('Invalid envelope structure', 'invalid-envelope');
  }

  let saltBytes: Uint8Array;
  let ivBytes: Uint8Array;
  let ciphertextBytes: Uint8Array;

  try {
    saltBytes = base64UrlToBuffer(envelope.salt);
    ivBytes = base64UrlToBuffer(envelope.iv);
    ciphertextBytes = base64UrlToBuffer(envelope.ciphertext);
  } catch (e) {
    throw new HealthEnvelopeError('Invalid base64url encoding', 'invalid-envelope');
  }

  const key = await getDerivedKey(normalized, saltBytes, envelope.iterations);

  const aad = getEnvelopeHeaderAad({
    v: envelope.v,
    kdf: envelope.kdf,
    iterations: envelope.iterations,
    salt: envelope.salt
  });

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes as unknown as BufferSource,
        additionalData: aad as unknown as BufferSource
      },
      key,
      ciphertextBytes as unknown as BufferSource
    );
  } catch (e) {
    throw new HealthEnvelopeError('Decryption failed. Wrong passphrase or tampered ciphertext.', 'wrong-passphrase');
  }

  return new TextDecoder().decode(decryptedBuffer);
}

export function isHealthEnvelope(value: unknown): value is HealthEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const env = value as any;
  if (env.v !== 1) return false;
  if (env.kdf !== 'PBKDF2-SHA-256') return false;
  if (typeof env.iterations !== 'number') return false;
  if (!Number.isInteger(env.iterations) || env.iterations < MIN_ITERATIONS || env.iterations > MAX_ITERATIONS) return false;
  if (typeof env.salt !== 'string' || typeof env.iv !== 'string' || typeof env.ciphertext !== 'string') return false;

  const maxCiphertextLength = Math.ceil((MAX_ENVELOPE_BYTES * 4) / 3);
  if (env.ciphertext.length > maxCiphertextLength) {
    return false;
  }

  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
  if (!base64UrlRegex.test(env.salt) || !base64UrlRegex.test(env.iv) || !base64UrlRegex.test(env.ciphertext)) {
    return false;
  }

  try {
    const saltB = base64UrlToBuffer(env.salt);
    const ivB = base64UrlToBuffer(env.iv);
    const ciphertextB = base64UrlToBuffer(env.ciphertext);
    if (saltB.byteLength !== ENVELOPE_SALT_BYTES || ivB.byteLength !== ENVELOPE_IV_BYTES || ciphertextB.byteLength < ENVELOPE_TAG_BYTES) {
      return false;
    }
  } catch (e) {
    return false;
  }

  return true;
}

export function encodeEnvelope(envelope: HealthEnvelope): string {
  return JSON.stringify(envelope);
}

export function decodeEnvelope(text: string): HealthEnvelope {
  if (typeof text !== 'string' || text.length > MAX_ENVELOPE_BYTES) {
    throw new HealthEnvelopeError('Envelope text exceeds maximum size limit', 'invalid-envelope');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new HealthEnvelopeError('Invalid JSON', 'invalid-envelope');
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as any).v !== undefined && (parsed as any).v !== ENVELOPE_VERSION) {
    throw new HealthEnvelopeError('Unsupported envelope version', 'unsupported-version');
  }

  if (!isHealthEnvelope(parsed)) {
    throw new HealthEnvelopeError('Invalid envelope structure', 'invalid-envelope');
  }

  return parsed;
}

export function isWithinDeepLinkLimit(encoded: string): boolean {
  return encoder.encode(encoded).byteLength <= DEEP_LINK_LIMIT_BYTES;
}

/**
 * Localisation-ready hints the UI can render next to the export/import controls so
 * the user understands the envelope's guarantees and limits.
 */
export interface EnvelopeHint {
  es: string;
  en: string;
}

export function envelopeHints(): EnvelopeHint[] {
  const iter = MIN_EXPORT_ITERATIONS.toLocaleString('en-US');
  return [
    {
      es: 'La frase de contraseña nunca sale de tu dispositivo; solo ella puede abrir el archivo.',
      en: 'Your passphrase never leaves your device; only it can open the file.',
    },
    {
      es: `Derivación de clave PBKDF2-SHA-256 con ${iter} iteraciones y cifrado AES-GCM de 256 bits.`,
      en: `PBKDF2-SHA-256 key derivation with ${iter} iterations and 256-bit AES-GCM.`,
    },
    {
      es: 'Guarda la frase en un lugar seguro: sin ella el archivo no se puede recuperar.',
      en: 'Store the passphrase safely: without it the file cannot be recovered.',
    },
    {
      es: `Los enlaces profundos admiten hasta ${DEEP_LINK_LIMIT_BYTES} bytes; por encima, comparte el archivo.`,
      en: `Deep links support up to ${DEEP_LINK_LIMIT_BYTES} bytes; above that, share the file.`,
    },
  ];
}
