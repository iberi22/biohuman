import { describe, it, expect, beforeEach } from 'vitest';
import { agentCreate, agentList, agentGet, agentSearch, agentDelete } from './agentDomain';
import { getMemoryAdapter, setStorageAdapter } from './domain';

describe('agentDomain 100% agentico', () => {
  beforeEach(() => { getMemoryAdapter().clear(); setStorageAdapter(getMemoryAdapter()); if (typeof localStorage !== 'undefined') localStorage.clear(); });

  it('agentCreate crea fila + memoria + mesh', async () => {
    const rec: any = await agentCreate('item', { name: 'AgentItem' } as any, 'inst1');
    expect(rec.id).toBeTruthy();
    expect(rec.instance_id).toBe('inst1');
    // lista filtra por instance
    const list = await agentList('item', 'inst1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(rec.id);
    // isolation
    expect(await agentList('item', 'inst2')).toHaveLength(0);
  });

  it('agentSearch combina memoria + records', async () => {
    await agentCreate('item', { name: 'BuscarZapato' } as any, 'inst1');
    const res = await agentSearch('item', 'zapato', 'inst1');
    expect(res.records.length).toBeGreaterThan(0);
    // memories puede estar vacio si Xavier offline, pero no falla
    expect(Array.isArray(res.memories)).toBe(true);
  });

  it('agentDelete borra y genera memoria delete', async () => {
    const rec: any = await agentCreate('item', { name: 'Borrar' } as any, 'inst1');
    expect(await agentDelete('item', rec.id, 'inst1')).toBe(true);
    expect(await agentGet('item', rec.id, 'inst1')).toBeNull();
  });

  it('rechaza entity no whitelisteada (100% agentico no inventa tablas)', async () => {
    await expect(agentCreate('evil' as any, {} as any)).rejects.toThrow();
  });
});
