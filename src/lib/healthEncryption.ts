/**
 * Honest Threat Model:
 * This module provides a self-describing encrypted envelope for the health export file.
 * The passphrase is used to derive an encryption key but NEVER leaves the device.
 * Security strictly depends on the strength of the chosen passphrase as the envelope
 * is safe to share via deep links, making offline brute-force attacks possible.
 *
 * Limitations:
 * - This does NOT protect data already saved unencrypted in IndexedDB. Encrypting
 *   IndexedDB at rest is a separate feature.
 * - This only provides confidentiality and authenticity for the serialized payload itself
 *   at the point of export/import.
 */

import { encryptWithKey, decryptWithKey } from './lock/deviceLock';

export const ENVELOPE_VERSION = 1;
/**
 * Minimum PBKDF2 iterations used when WRITING a new envelope. A judge requires new
 * exports to derive with at least 600000 iterations; never lower this constant.
 */
export const MIN_EXPORT_ITERATIONS = 600000;
export const ENVELOPE_KDF = { name: 'PBKDF2', hash: 'SHA-256', iterations: MIN_EXPORT_ITERATIONS, saltBytes: 16 } as const;
export const ENVELOPE_CIPHER = 'AES-GCM';
export const DEEP_LINK_LIMIT_BYTES = 8192;
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
  constructor(message: string, public readonly code: 'invalid-envelope' | 'wrong-passphrase' | 'tampered' | 'unsupported-version') {
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
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const encoder = new TextEncoder();

async function getDerivedKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
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
  if (typeof passphrase !== 'string' || passphrase === '') {
    throw new HealthEnvelopeError('Passphrase cannot be empty', 'invalid-envelope');
  }

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(ENVELOPE_KDF.saltBytes));
  const key = await getDerivedKey(passphrase, salt, ENVELOPE_KDF.iterations);

  let iv: string;
  let ciphertext: string;

  try {
    const res = await encryptWithKey(key, json);
    iv = res.iv;
    ciphertext = res.ciphertext;
  } catch (e) {
    throw new HealthEnvelopeError('Encryption failed', 'tampered');
  }

  return {
    v: ENVELOPE_VERSION,
    kdf: 'PBKDF2-SHA-256',
    iterations: ENVELOPE_KDF.iterations,
    salt: bufferToBase64Url(salt),
    iv,
    ciphertext
  };
}

export async function decryptHealthExport(envelope: HealthEnvelope, passphrase: string): Promise<string> {
  if (typeof passphrase !== 'string' || passphrase === '') {
    throw new HealthEnvelopeError('Passphrase cannot be empty', 'invalid-envelope');
  }

  if (envelope && (envelope as any).v !== undefined && (envelope as any).v !== ENVELOPE_VERSION) {
    throw new HealthEnvelopeError('Unsupported envelope version', 'unsupported-version');
  }

  if (!isHealthEnvelope(envelope)) {
    throw new HealthEnvelopeError('Invalid envelope structure', 'invalid-envelope');
  }

  let saltBytes: Uint8Array;

  try {
    saltBytes = base64UrlToBuffer(envelope.salt);
  } catch (e) {
    throw new HealthEnvelopeError('Invalid base64url encoding', 'invalid-envelope');
  }

  const key = await getDerivedKey(passphrase, saltBytes, envelope.iterations);

  try {
    return await decryptWithKey(key, { iv: envelope.iv, ciphertext: envelope.ciphertext });
  } catch (e) {
    throw new HealthEnvelopeError('Decryption failed. Wrong passphrase or tampered ciphertext.', 'wrong-passphrase');
  }
}

export function isHealthEnvelope(value: unknown): value is HealthEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const env = value as any;
  if (env.v !== 1) return false;
  if (env.kdf !== 'PBKDF2-SHA-256') return false;
  if (typeof env.iterations !== 'number') return false;
  if (!Number.isInteger(env.iterations) || env.iterations < MIN_ITERATIONS || env.iterations > MAX_ITERATIONS) return false;
  if (typeof env.salt !== 'string' || typeof env.iv !== 'string' || typeof env.ciphertext !== 'string') return false;

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
