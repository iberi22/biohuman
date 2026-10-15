import { openDB } from 'idb';
import type { DomainRecord, StorageAdapter } from './domain';
import { setStorageAdapter } from './domain';
function ensureCloneable<T>(val: T): T {
  try {
    structuredClone(val);
    return val;
  } catch (err) {
    console.warn('Value is not cloneable, converting it', err);
    return JSON.parse(JSON.stringify(val));
  }
}

// Reuses the template CRUD boundary; health records never use its remote adapters.
export async function initializeLocalStorage() {
  const db=await openDB('biohuman-v1',1,{upgrade(db){db.createObjectStore('records',{keyPath:['entity','id']});}});
  const adapter:StorageAdapter={
    async create(entity,record){const safe=ensureCloneable(record);await db.put('records',{...safe,entity});return safe;},
    async list(entity,instanceId){return (await db.getAll('records')).filter(r=>r.entity===entity&&r.instance_id===instanceId);},
    async get(entity,id,instanceId){const r=await db.get('records',[entity,id]);return r?.instance_id===instanceId?r:null;},
    async update(entity,id,patch,instanceId){const r=await this.get(entity,id,instanceId);if(!r)return null;const next={...r,...patch,id:r.id,instance_id:r.instance_id,updated_at:new Date().toISOString()};const safe=ensureCloneable(next);await db.put('records',{...safe,entity});return safe as DomainRecord;},
    async del(entity,id,instanceId){if(!await this.get(entity,id,instanceId))return false;await db.delete('records',[entity,id]);return true;}
  };
  setStorageAdapter(adapter);return adapter;
}
