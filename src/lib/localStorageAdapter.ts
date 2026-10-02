import { openDB } from 'idb';
import type { DomainRecord, StorageAdapter } from './domain';
import { setStorageAdapter } from './domain';
// Reuses the template CRUD boundary; health records never use its remote adapters.
export async function initializeLocalStorage() {
  const db=await openDB('biohuman-v1',1,{upgrade(db){db.createObjectStore('records',{keyPath:['entity','id']});}});
  const adapter:StorageAdapter={
    async create(entity,record){await db.put('records',{...record,entity});return record;},
    async list(entity,instanceId){return (await db.getAll('records')).filter(r=>r.entity===entity&&r.instance_id===instanceId);},
    async get(entity,id,instanceId){const r=await db.get('records',[entity,id]);return r?.instance_id===instanceId?r:null;},
    async update(entity,id,patch,instanceId){const r=await this.get(entity,id,instanceId);if(!r)return null;const next={...r,...patch,id:r.id,instance_id:r.instance_id,updated_at:new Date().toISOString()};await db.put('records',{...next,entity});return next as DomainRecord;},
    async del(entity,id,instanceId){if(!await this.get(entity,id,instanceId))return false;await db.delete('records',[entity,id]);return true;}
  };
  setStorageAdapter(adapter);return adapter;
}
