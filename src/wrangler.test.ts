import { describe, it, expect } from 'vitest';
import wrangler from '../wrangler.toml?raw';

// BioHuman es offline-first: los datos de salud viven en IndexedDB del
// dispositivo. wrangler.toml no debe arrastrar ningun binding del template
// (D1/R2/KV compartidos con otras apps SWAL) ni apuntar a recursos ajenos.
const SHARED_RESOURCES = [
  'swal-billing',
  'swal-app-template-r2',
  '1c920534-54fc-449e-b944-180bf96ffe37',
  '57e68d72ca7545c39630c03677f3ac9d',
  '9aef690dde244d51982f2947dba2d7aa',
];

describe('wrangler.toml (offline-first, sin bindings del template)', () => {
  it('despliega como biohuman', () => {
    expect(wrangler).toMatch(/^\s*name\s*=\s*"biohuman"/m);
  });

  it('no declara ningun binding (D1, R2, KV, AI)', () => {
    for (const block of ['[[d1_databases]]', '[[r2_buckets]]', '[[kv_namespaces]]', '[ai]', '[env]']) {
      expect(wrangler, `binding prohibido: ${block}`).not.toContain(block);
    }
  });

  it('no referencia recursos compartidos de otras apps SWAL', () => {
    for (const resource of SHARED_RESOURCES) {
      expect(wrangler, `recurso ajeno referenciado: ${resource}`).not.toContain(resource);
    }
  });

  it('documenta que no queda ningun binding y por que', () => {
    expect(wrangler).toMatch(/IndexedDB/);
    expect(wrangler).toMatch(/no (remote|backend)/i);
  });
});
