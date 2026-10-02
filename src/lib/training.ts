import catalog from '../data/exercises.json';
export type Exercise = (typeof catalog)[number];
export const exercises: Exercise[] = catalog;
export type SetLog = { reps?:number; weightKg?:number; durationS?:number; distanceM?:number; rpe?:number };
export type Target = { ref:string; sets:number; reps:number; weightKg:number; durationS:number; distanceM:number; restS:number };
export type Routine = { id:string; name:string; exercises:Target[] };
export type SessionData = { startedAt:string; endedAt:string; routineId?:string; exercises:{ref:string;sets:SetLog[]}[]; energy?:{kcal:number;method:'met-estimate'|'device'|'declared'|'unknown'}; perceivedEffort?:number; notes?:string };
export type Workout = { schema:'swal.health/v1/workout-session'; id:string; subject:string; createdAt:string; source:{app:'training';version:string}; gosDataset:string; data:SessionData };
export type DietaryProfile = { schema:'swal.health/v1/dietary-profile'; id:string; subject:string; createdAt:string; source:{app:string;version:string}; gosDataset:string; data:{allergens:string[]; diets:string[]; targets:{kcalPerDay?:number;proteinGPerDay?:number};expiresAt:string} };
export type ActiveSession = { id:string; routine:Routine; startedAt:string; index:number; exercises:{ref:string;sets:SetLog[]}[]; restUntil:number; bodyKg:number };
export type Preferences = { theme:'light'|'dark'|'system'; units:'kg'|'lb'; language:'es'|'en'; bodyKg:number; subject:string };
const alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function ulid(now=Date.now()):string {
  let prefix=''; for(let i=0;i<10;i++){prefix=alphabet[now%32]+prefix;now=Math.floor(now/32);}
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  return prefix+Array.from(bytes,b=>alphabet[b%32]).join('');
}
export const normalizeSearch=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function searchExercises(query:string, muscle='', equipment='', type=''):Exercise[] {
  const tokens=normalizeSearch(query).split(/\s+/).filter(Boolean);
  return exercises.filter(e=>(!muscle||e.muscleGroup===muscle)&&(!equipment||e.equipment===equipment)&&(!type||e.exerciseType===type)&&tokens.every(t=>normalizeSearch(`${e.name} ${e.name_es} ${e.equipment} ${e.primaryMuscle}`).includes(t)));
}
export function exerciseByRef(ref:string):Exercise { const e=exercises.find(e=>e.id===ref);if(!e)throw Error('Ejercicio desconocido');return e; }
export function logSet(session:ActiveSession, set:SetLog):ActiveSession {
  const e=exerciseByRef(session.exercises[session.index].ref);
  if(!validSet(set))throw Error('Valores de serie inválidos');
  if(['weight_reps','bodyweight_reps','assisted_bodyweight'].includes(e.exerciseType)&&!(set.reps&&Number.isInteger(set.reps)))throw Error('Introduce repeticiones');
  if(['duration','distance_duration'].includes(e.exerciseType)&&!set.durationS)throw Error('Introduce duración');
  if(e.exerciseType==='distance_duration'&&!set.distanceM)throw Error('Introduce distancia');
  if(e.exerciseType==='weight_reps'&&set.weightKg===undefined)throw Error('Introduce peso');
  return {...session, exercises:session.exercises.map((x,i)=>i===session.index?{...x,sets:[...x.sets,{...set}]}:x),restUntil:Date.now()+session.routine.exercises[session.index].restS*1000};
}
export const setVolume=(s:SetLog)=>(s.reps??0)*(s.weightKg??0);
export const sessionVolume=(s:Workout)=>s.data.exercises.reduce((v,e)=>v+e.sets.reduce((n,s)=>n+setVolume(s),0),0);
export function progress(sessions:Workout[],ref:string) {
  return [...sessions].sort((a,b)=>a.data.startedAt.localeCompare(b.data.startedAt)).flatMap(s=>{
    const sets=s.data.exercises.filter(e=>e.ref===ref).flatMap(e=>e.sets); if(!sets.length)return [];
    return [{date:s.data.startedAt,volume:sets.reduce((v,s)=>v+setVolume(s),0),best:Math.max(...sets.map(s=>s.weightKg??0)),bestReps:Math.max(...sets.map(s=>s.reps??0)),bestDuration:Math.max(...sets.map(s=>s.durationS??0)),bestDistance:Math.max(...sets.map(s=>s.distanceM??0))}];
  });
}
export function weeklyVolume(sessions:Workout[]) {
  const totals=new Map<string,number>();for(const s of sessions){const d=new Date(s.data.startedAt);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));const k=d.toISOString().slice(0,10);totals.set(k,(totals.get(k)??0)+sessionVolume(s));}return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([date,volume])=>({date,volume}));
}
// 2024 Adult Compendium: 02054 resistance 3.5; 02056 bodyweight 3.0;
// 02101 stretching 2.3. Other activities use the documented general 3.5 fallback.
export function metFor(e:Exercise):number { return e.isStretch?2.3:e.exerciseType==='bodyweight_reps'||e.exerciseType==='assisted_bodyweight'?3:3.5; }
export function metEnergy(met:number,kg:number,seconds:number):number { if(![met,kg,seconds].every(Number.isFinite)||met<=0||kg<=0||seconds<0)throw Error('MET, masa o tiempo inválido');return Math.round(met*3.5*kg/200*seconds/60); }
export function finishSession(active:ActiveSession,subject:string,endedAt=new Date().toISOString(),notes='',perceivedEffort=7):Workout {
  const done=active.exercises.filter(e=>e.sets.length);if(!done.length)throw Error('Registra al menos una serie');
  const seconds=(Date.parse(endedAt)-Date.parse(active.startedAt))/1000;if(seconds<0)throw Error('Duración inválida');
  const met=done.reduce((v,e)=>v+metFor(exerciseByRef(e.ref)),0)/done.length;
  const record:Workout={schema:'swal.health/v1/workout-session',id:active.id,subject,createdAt:endedAt,source:{app:'training',version:'0.1.0'},gosDataset:GOS_DATASET_NONE,data:{startedAt:active.startedAt,endedAt,routineId:active.routine.id,exercises:done,energy:{kcal:metEnergy(met,active.bodyKg,seconds),method:'met-estimate'},notes,perceivedEffort}};
  validateWorkout(record);return record;
}
export function startSession(routine:Routine,bodyKg:number):ActiveSession { if(!routine.exercises.length)throw Error('Rutina vacía');return {id:ulid(),routine:structuredClone(routine),startedAt:new Date().toISOString(),index:0,exercises:routine.exercises.map(e=>({ref:e.ref,sets:[]})),restUntil:0,bodyKg}; }
export function target(slug:string,sets=3,reps=10,durationS=45,restS=60):Target {const e=exerciseByRef(`wg:${slug}`);return {ref:e.id,sets,reps,weightKg:0,durationS,distanceM:400,restS};}
export const starterRoutines:Routine[]=[
  {id:'starter-full-body',name:'Full body principiante',exercises:['bodyweight-squat','knee-push-up','banded-row','glute-bridge','plank'].map(s=>target(s,3,10))},
  {id:'starter-ppl',name:'Push/Pull/Legs',exercises:['bench-press','overhead-press','lat-pulldown','seated-row','squat','leg-curl'].map(s=>target(s))},
  {id:'starter-mobility',name:'Movilidad 15 min',exercises:['cat-cow-stretch','worlds-greatest-stretch','kneeling-hip-flexor-stretch','hamstring-stretch','childs-pose'].map(s=>target(s,3,1,50,10))}
];
import { validateRecord, fromFile, toFile, encodeDeepLink, type HealthRecord } from '../../vendor/health-contract/src/index';
/** Training computes no nutrients, so it pins the contract's all-zero "no dataset" manifest. */
export const GOS_DATASET_NONE=`0.0.0+sha256:${'0'.repeat(64)}`;
export function validSet(v:unknown):v is SetLog { const r=validateRecord({schema:'swal.health/v1/workout-session',id:'01J00000000000000000000000',subject:'subj_01J00000000000000000000000',createdAt:'2026-01-01T00:00:00Z',source:{app:'training',version:'0.0.0'},gosDataset:GOS_DATASET_NONE,data:{startedAt:'2026-01-01T00:00:00Z',endedAt:'2026-01-01T00:00:00Z',exercises:[{ref:'wg:x',sets:[v]}]}});return r.ok; }
export function validateWorkout(r:unknown):asserts r is Workout {
  if(!validateRecord(r).ok||(r as any).schema!=='swal.health/v1/workout-session')throw Error('Sesión de entrenamiento inválida');
  const d=(r as Workout).data;if(Date.parse(d.endedAt)<Date.parse(d.startedAt))throw Error('Sesión de entrenamiento inválida');
}
export function validateDietaryProfile(r:unknown):asserts r is DietaryProfile {
  if(!validateRecord(r).ok||(r as any).schema!=='swal.health/v1/dietary-profile')throw Error('Perfil dietario inválido');
}
/** Parses a .swalhealth.json array with the shared contract; meal-logs are validated but ignored by this app. */
export function parseHealthFile(json:string):(Workout|DietaryProfile)[] {
  let a:unknown;try{a=JSON.parse(json);}catch{throw Error('El archivo debe contener un array de registros');}
  if(!Array.isArray(a)||!a.length)throw Error('El archivo debe contener un array de registros');
  let recs:HealthRecord[];try{recs=fromFile(json);}catch{
    for(const r of a){const t=(r as any)?.schema;if(t==='swal.health/v1/dietary-profile')validateDietaryProfile(r);else if(t==='swal.health/v1/workout-session')validateWorkout(r);else validateRecord(r);}
    throw Error('Sobre de salud inválido');}
  const mine=recs.filter(r=>r.schema!=='swal.health/v1/meal-log') as unknown as (Workout|DietaryProfile)[];
  recs.forEach(r=>{if(r.schema==='swal.health/v1/workout-session')validateWorkout(r);});
  if(!mine.length)throw Error('El archivo no contiene sesiones de entrenamiento');
  return mine;
}
export function toHealthFile(records:Workout[]):string {records.forEach(validateWorkout);return toFile(records as unknown as HealthRecord[]);}
export async function orionDeepLink(records:Workout[]):Promise<string> {
  records.forEach(validateWorkout);
  try{return await encodeDeepLink(records as unknown as HealthRecord[],'orionhealth://import');}
  catch(e){if(e instanceof Error&&e.name==='DeepLinkSizeError')throw Error('Payload mayor de 8 KB. Exporta el archivo.');throw e;}
}
export const kgToDisplay=(kg:number,units:'kg'|'lb')=>units==='lb'?kg*2.2046226218:kg;
export const displayToKg=(weight:number,units:'kg'|'lb')=>units==='lb'?weight/2.2046226218:weight;
