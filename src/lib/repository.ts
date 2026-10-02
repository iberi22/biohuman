import { getStorageAdapter, type EntityName } from './domain';
export async function readLocal<T>(entity:EntityName,fallback:T):Promise<T>{const r=await getStorageAdapter().get(entity,'local','default');return r?r.payload as T:fallback;}
export async function saveLocal<T>(entity:EntityName,payload:T){const now=new Date().toISOString();await getStorageAdapter().create(entity,{id:'local',instance_id:'default',created_at:now,updated_at:now,payload});}
