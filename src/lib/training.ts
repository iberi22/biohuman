import catalog from '../data/exercises.json';
export type Exercise = (typeof catalog)[number];
export const exercises: Exercise[] = catalog;
export type SetLog = { reps?:number; weightKg?:number; durationS?:number; distanceM?:number; rpe?:number };
export type Target = { ref:string; sets:number; reps:number; weightKg:number; durationS:number; distanceM:number; restS:number };
export type Routine = { id:string; name:string; exercises:Target[] };
export type SessionData = { startedAt:string; endedAt:string; routineId?:string; exercises:{ref:string;sets:SetLog[]}[]; energy:{kcal:number;method:'met-estimate'}; perceivedEffort?:number; notes?:string };
export type Workout = { schema:'swal.health/v1/workout-session'; id:string; subject:string; createdAt:string; source:{app:'training';version:string}; data:SessionData };
export type DietaryProfile = { schema:'swal.health/v1/dietary-profile'; id:string; subject:string; createdAt:string; source:{app:string;version:string}; data:{allergens:string[]; diets:string[]; targets?:{kcalPerDay?:number;proteinGPerDay?:number};expiresAt:string} };
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
// 02100 stretching 2.3. Other activities use the documented general 3.5 fallback.
export function metFor(e:Exercise):number { return e.isStretch?2.3:e.exerciseType==='bodyweight_reps'||e.exerciseType==='assisted_bodyweight'?3:3.5; }
export function metEnergy(met:number,kg:number,seconds:number):number { if(![met,kg,seconds].every(Number.isFinite)||met<=0||kg<=0||seconds<0)throw Error('MET, masa o tiempo inválido');return Math.round(met*3.5*kg/200*seconds/60); }
export function finishSession(active:ActiveSession,subject:string,endedAt=new Date().toISOString(),notes='',perceivedEffort=7):Workout {
  const done=active.exercises.filter(e=>e.sets.length);if(!done.length)throw Error('Registra al menos una serie');
  const seconds=(Date.parse(endedAt)-Date.parse(active.startedAt))/1000;if(seconds<0)throw Error('Duración inválida');
  const met=done.reduce((v,e)=>v+metFor(exerciseByRef(e.ref)),0)/done.length;
  const record:Workout={schema:'swal.health/v1/workout-session',id:active.id,subject,createdAt:endedAt,source:{app:'training',version:'0.1.0'},data:{startedAt:active.startedAt,endedAt,routineId:active.routine.id,exercises:done,energy:{kcal:metEnergy(met,active.bodyKg,seconds),method:'met-estimate'},notes,perceivedEffort}};
  validateWorkout(record);return record;
}
export function startSession(routine:Routine,bodyKg:number):ActiveSession { if(!routine.exercises.length)throw Error('Rutina vacía');return {id:ulid(),routine:structuredClone(routine),startedAt:new Date().toISOString(),index:0,exercises:routine.exercises.map(e=>({ref:e.ref,sets:[]})),restUntil:0,bodyKg}; }
export function target(slug:string,sets=3,reps=10,durationS=45,restS=60):Target {const e=exerciseByRef(`wg:${slug}`);return {ref:e.id,sets,reps,weightKg:0,durationS,distanceM:400,restS};}
export const starterRoutines:Routine[]=[
  {id:'starter-full-body',name:'Full body principiante',exercises:['bodyweight-squat','knee-push-up','banded-row','glute-bridge','plank'].map(s=>target(s,3,10))},
  {id:'starter-ppl',name:'Push/Pull/Legs',exercises:['bench-press','overhead-press','lat-pulldown','seated-row','squat','leg-curl'].map(s=>target(s))},
  {id:'starter-mobility',name:'Movilidad 15 min',exercises:['cat-cow-stretch','worlds-greatest-stretch','kneeling-hip-flexor-stretch','hamstring-stretch','childs-pose'].map(s=>target(s,3,1,50,10))}
];
const isObject=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const validDate=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const positive=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0;
export function validSet(v:unknown):v is SetLog { if(!isObject(v)||!Object.keys(v).length||Object.keys(v).some(k=>!['reps','weightKg','durationS','distanceM','rpe'].includes(k)))return false;return Object.entries(v).every(([k,n])=>typeof n==='number'&&Number.isFinite(n)&&(k==='weightKg'?n>=0:k==='rpe'?n>=1&&n<=10:k==='reps'?positive(n)&&Number.isInteger(n):positive(n)))&&('reps'in v||'durationS'in v||'distanceM'in v); }
function envelope(r:unknown):asserts r is Record<string,any> {if(!isObject(r)||!/^([0-7][0-9A-HJKMNP-TV-Z]{25})$/.test(r.id)||!/^subj_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(r.subject)||!validDate(r.createdAt)||!isObject(r.source)||!['training','orionhealth','gos','fize'].includes(r.source.app)||typeof r.source.version!=='string'||!isObject(r.data))throw Error('Sobre de salud inválido');}
export function validateWorkout(r:unknown):asserts r is Workout {
  envelope(r); const d=r.data;
  if(r.schema!=='swal.health/v1/workout-session'||!validDate(d.startedAt)||!validDate(d.endedAt)||Date.parse(d.endedAt)<Date.parse(d.startedAt)||!Array.isArray(d.exercises)||!d.exercises.length||!d.exercises.every((e:any)=>isObject(e)&&typeof e.ref==='string'&&/^wg:[a-z0-9-]+$/.test(e.ref)&&Array.isArray(e.sets)&&e.sets.length&&e.sets.every(validSet))||!isObject(d.energy)||d.energy.method!=='met-estimate'||typeof d.energy.kcal!=='number'||!Number.isFinite(d.energy.kcal)||d.energy.kcal<0||(d.perceivedEffort!==undefined&&(!positive(d.perceivedEffort)||d.perceivedEffort>10))||(d.notes!==undefined&&typeof d.notes!=='string')||(d.routineId!==undefined&&typeof d.routineId!=='string'))throw Error('Sesión de entrenamiento inválida');
}
export function validateDietaryProfile(r:unknown):asserts r is DietaryProfile {
  envelope(r);const d=r.data;
  if(r.schema!=='swal.health/v1/dietary-profile'||!Array.isArray(d.allergens)||!d.allergens.every((s:any)=>typeof s==='string'&&/^gos:allergen\/[a-z0-9-]+$/.test(s))||!Array.isArray(d.diets)||!d.diets.every((s:any)=>typeof s==='string'&&/^gos:diet\/[a-z0-9-]+$/.test(s))||!validDate(d.expiresAt)||(d.targets!==undefined&&(!isObject(d.targets)||Object.entries(d.targets).some(([k,v])=>!['kcalPerDay','proteinGPerDay'].includes(k)||!positive(v)))))throw Error('Perfil dietario inválido');
}
export function parseHealthFile(json:string):(Workout|DietaryProfile)[] {const a:unknown=JSON.parse(json);if(!Array.isArray(a)||!a.length)throw Error('El archivo debe contener un array de registros');for(const r of a){if(isObject(r)&&r.schema==='swal.health/v1/dietary-profile')validateDietaryProfile(r);else validateWorkout(r);}return a;}
export function toHealthFile(records:Workout[]):string {records.forEach(validateWorkout);return JSON.stringify(records,null,2);}
export async function orionDeepLink(records:Workout[]):Promise<string> {
  const bytes=new TextEncoder().encode(toHealthFile(records));
  const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const zipped=new Uint8Array(await new Response(stream).arrayBuffer());
  const payload=btoa(Array.from(zipped,b=>String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  if(new TextEncoder().encode(payload).length>8192)throw Error('Payload mayor de 8 KB. Exporta el archivo.');
  return `orionhealth://import?p=${payload}`;
}
export const kgToDisplay=(kg:number,units:'kg'|'lb')=>units==='lb'?kg*2.2046226218:kg;
export const displayToKg=(weight:number,units:'kg'|'lb')=>units==='lb'?weight/2.2046226218:weight;
