/**
 * Honest Threat Model:
 * This module provides a self-describing encrypted envelope for the health export file.
 * The passphrase is used to derive an encryption key but NEVER leaves the device.
 * The resulting envelope is safe to store on untrusted storage or share via deep links.
 *
 * Limitations:
 * - This does NOT protect data already stored unencrypted in IndexedDB. Encrypting
 *   IndexedDB at rest is a separate feature.
 * - This only provides confidentiality and authenticity for the serialized payload itself
 *   at the point of export/import.
 */

export const ENVELOPE_VERSION = 1;
export const ENVELOPE_KDF = { name: 'PBKDF2', hash: 'SHA-256', iterations: 210000, saltBytes: 16 } as const;
export const ENVELOPE_CIPHER = 'AES-GCM';
export const DEEP_LINK_LIMIT_BYTES = 8192;

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
const decoder = new TextDecoder();

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
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(ENVELOPE_KDF.saltBytes));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

  const key = await getDerivedKey(passphrase, salt, ENVELOPE_KDF.iterations);

  const encodedJson = encoder.encode(json);
  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    encodedJson
  );

  return {
    v: ENVELOPE_VERSION,
    kdf: 'PBKDF2-SHA-256',
    iterations: ENVELOPE_KDF.iterations,
    salt: bufferToBase64Url(salt),
    iv: bufferToBase64Url(iv),
    ciphertext: bufferToBase64Url(ciphertextBuffer)
  };
}

export async function decryptHealthExport(envelope: HealthEnvelope, passphrase: string): Promise<string> {
  if (!isHealthEnvelope(envelope)) {
    throw new HealthEnvelopeError('Invalid envelope structure', 'invalid-envelope');
  }
  if (envelope.v !== ENVELOPE_VERSION) {
    throw new HealthEnvelopeError('Unsupported envelope version', 'unsupported-version');
  }

  let saltBytes: Uint8Array;
  let ivBytes: Uint8Array;
  let cipherBytes: Uint8Array;

  try {
    saltBytes = base64UrlToBuffer(envelope.salt);
    ivBytes = base64UrlToBuffer(envelope.iv);
    cipherBytes = base64UrlToBuffer(envelope.ciphertext);
  } catch (e) {
    throw new HealthEnvelopeError('Invalid base64url encoding', 'tampered');
  }

  const key = await getDerivedKey(passphrase, saltBytes, envelope.iterations);

  try {
    const plaintextBuffer = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes as unknown as BufferSource
      },
      key,
      cipherBytes as unknown as BufferSource
    );
    return decoder.decode(plaintextBuffer);
  } catch (e) {
    throw new HealthEnvelopeError('Decryption failed. Wrong passphrase or tampered ciphertext.', 'tampered');
  }
}

export function isHealthEnvelope(value: unknown): value is HealthEnvelope {
  if (!value || typeof value !== 'object') return false;
  const env = value as HealthEnvelope;
  if (env.v !== 1) return false;
  if (env.kdf !== 'PBKDF2-SHA-256') return false;
  if (typeof env.iterations !== 'number') return false;
  if (typeof env.salt !== 'string' || typeof env.iv !== 'string' || typeof env.ciphertext !== 'string') return false;

  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
  if (!base64UrlRegex.test(env.salt) || !base64UrlRegex.test(env.iv) || !base64UrlRegex.test(env.ciphertext)) {
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

  if (!isHealthEnvelope(parsed)) {
    throw new HealthEnvelopeError('Invalid envelope structure', 'invalid-envelope');
  }

  return parsed;
}

export function isWithinDeepLinkLimit(encoded: string): boolean {
  return encoder.encode(encoded).byteLength <= DEEP_LINK_LIMIT_BYTES;
}
