import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { initializeLocalStorage } from './localStorageAdapter';
import { getStorageAdapter } from './domain';

describe('localStorageAdapter', () => {
  beforeEach(() => {
    // indexedDB is automatically fake-indexeddb because of the import above
  });

  it('should successfully save and retrieve a plain object', async () => {
    const adapter = await initializeLocalStorage();
    const record = { id: '1', instance_id: 'default', payload: { a: 1 }, created_at: '', updated_at: '' };

    await adapter.create('test-entity', record);

    const retrieved = await adapter.get('test-entity', '1', 'default');
    expect(retrieved).toBeDefined();
    expect(retrieved?.payload).toEqual({ a: 1 });
  });

  it('should successfully save and clone an object built from a Proxy (DataCloneError simulated by having uncloneable properties, but here we can just use a Proxy that structuredClone normally rejects, or test the guard)', async () => {
    const adapter = await initializeLocalStorage();

    // In JS/TS, structuredClone throws on Proxies or objects containing functions/symbols.
    const target = { a: 1 };
    const proxy = new Proxy(target, {});

    const record = { id: '2', instance_id: 'default', payload: proxy, created_at: '', updated_at: '' };

    // This should not throw if the adapter correctly guards with JSON.parse(JSON.stringify())
    await expect(adapter.create('proxy-entity', record)).resolves.toBeDefined();

    const retrieved = await adapter.get('proxy-entity', '2', 'default');
    expect(retrieved).toBeDefined();
    expect(retrieved?.payload).toEqual({ a: 1 }); // because it was serialized to plain JSON
  });
});
