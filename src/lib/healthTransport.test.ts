// @vitest-environment node
import { it,expect } from 'vitest';
import { orionDeepLink,startSession,starterRoutines,logSet,finishSession,ulid,parseHealthFile } from './training';
it('deep link is gzip JSON array encoded as base64url and roundtrips',async()=>{
 const record=finishSession(logSet(startSession(starterRoutines[0],70),{reps:10}),`subj_${ulid()}`);
 const link=await orionDeepLink([record]);const payload=link.split('p=')[1];expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
 const zipped=Uint8Array.from(atob(payload.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
 const decoded=await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
 expect(parseHealthFile(decoded)).toEqual([record]);
});
it('deep links above 8 KB direct the user to file export',async()=>{
 const record=finishSession(logSet(startSession(starterRoutines[0],70),{reps:10}),`subj_${ulid()}`);
 record.data.notes=Array.from(crypto.getRandomValues(new Uint8Array(20000)),b=>b.toString(16).padStart(2,'0')).join('');
 await expect(orionDeepLink([record])).rejects.toThrow('8 KB');
});
