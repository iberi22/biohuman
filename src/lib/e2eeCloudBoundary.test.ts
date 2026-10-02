// Frontera E2EE: la nube (R2 + D1 + KV) NO puede descifrar nada.
//
// Este test existe porque la promesa "el operador no puede leer" era FALSA: el adaptador subia a R2
// el pack completo (con las 3 shares del reparto Shamir) y ADEMAS guardaba las 3 en KV. Como el
// reparto es 2-de-3, con lo que habia en R2 se reconstruia la DEK. Ahora R2 guarda el pack sin
// shares, KV guarda un unico share (x=3) y los shares x=1 (dispositivo) y x=2 (recuperacion) no
// salen del equipo; por tanto la nube entera suma 1 share y no alcanza el umbral.
import { describe, it, expect } from 'vitest';
import { CloudflareVaultAdapter, type CloudflareEnv } from './cloudflareVaultAdapter';
import { reconstructDEK, unpackSealedPack } from '@swal/vault/sealedPack.js';

function fakeCloud() {
  const r2 = new Map<string, string>();
  const kv = new Map<string, string>();
  const env: CloudflareEnv = {
    SWAL_R2: {
      put: async (k: string, v: string) => void r2.set(k, v),
      get: async (k: string) => {
        const v = r2.get(k);
        return v === undefined ? null : { text: async () => v };
      },
      delete: async (k: string) => void r2.delete(k),
      list: async () => ({ objects: [] as unknown[] }),
    },
    SWAL_KV: {
      put: async (k: string, v: string) => void kv.set(k, v),
      get: async (k: string) => kv.get(k) ?? null,
    },
  };
  return { env, r2, kv };
}

const SECRETO = 'dato-confidencial-del-cliente-12345';
const rec = () => ({
  id: 'r1',
  instance_id: 'inst1',
  created_at: '2026-09-10T00:00:00Z',
  updated_at: '2026-09-10T00:00:00Z',
  secreto: SECRETO,
});

describe('frontera E2EE — la nube no puede descifrar', () => {
  it('R2 guarda el pack SIN shares (antes iban las 3)', async () => {
    const { env, r2 } = fakeCloud();
    const adapter = new CloudflareVaultAdapter(env, 'app-e2ee');
    await adapter.create('item', rec() as any);

    const claves = [...r2.keys()];
    expect(claves).toHaveLength(1);
    const pack = JSON.parse(r2.get(claves[0])!);
    expect(pack.ciphertext, 'debe haber ciphertext').toBeTruthy();
    expect(pack.shares ?? []).toHaveLength(0);
    // El ciphertext no puede contener el texto plano.
    expect(JSON.stringify(pack)).not.toContain(SECRETO);
  });

  it('KV guarda exactamente UN share y es el x=3', async () => {
    const { env, kv } = fakeCloud();
    const adapter = new CloudflareVaultAdapter(env, 'app-e2ee');
    await adapter.create('item', rec() as any);

    const entradas = [...kv.entries()];
    expect(entradas, 'una sola entrada en KV').toHaveLength(1);
    const shares = JSON.parse(entradas[0][1]);
    expect(shares).toHaveLength(1);
    expect(shares[0].index).toBe(3);
  });

  it('TODO lo que posee la nube (R2 + KV) no reconstruye la DEK ni descifra', async () => {
    const { env, r2, kv } = fakeCloud();
    const adapter = new CloudflareVaultAdapter(env, 'app-e2ee');
    await adapter.create('item', rec() as any);

    const pack = JSON.parse([...r2.values()][0]);
    const kvShares = JSON.parse([...kv.values()][0]);

    // 1 share < umbral 2: la reconstruccion debe fallar.
    expect(() => reconstructDEK(kvShares)).toThrow();
    // Y el descifrado del pack con solo el share de KV tampoco puede.
    await expect(unpackSealedPack(pack, kvShares)).rejects.toThrow();
  });

  it('con el share del dispositivo + el de KV sí descifra (round trip)', async () => {
    const { env } = fakeCloud();
    const adapter = new CloudflareVaultAdapter(env, 'app-e2ee');
    await adapter.create('item', rec() as any);

    const got = await adapter.get('item', 'r1', 'inst1');
    expect(got?.secreto).toBe(SECRETO);
  });

  it('sin el share del dispositivo NO descifra aunque la nube esté completa', async () => {
    const { env } = fakeCloud();
    const autor = new CloudflareVaultAdapter(env, 'app-e2ee');
    await autor.create('item', rec() as any);

    // Otro dispositivo/instancia con los MISMOS bindings de nube pero sin el share local:
    // debe ser incapaz de leer. Es exactamente el escenario del operador de la nube.
    const ajeno = new CloudflareVaultAdapter(env, 'app-e2ee');
    const got = await ajeno.get('item', 'r1', 'inst1');
    expect(got).toBeNull();
  });

  it('la recuperacion (x=2) se entrega en el dispositivo y no viaja a la nube', async () => {
    const { env, r2, kv } = fakeCloud();
    const adapter = new CloudflareVaultAdapter(env, 'app-e2ee');
    await adapter.create('item', rec() as any);

    const recovery = await adapter.recoveryShare('r1');
    expect(recovery?.index).toBe(2);

    // En ningun valor de la nube puede aparecer el share de recuperacion.
    const enNube = [...r2.values(), ...kv.values()].join('|');
    const b64 = String(recovery.value);
    expect(enNube).not.toContain(b64);
  });
});
