// @vitest-environment node
import { describe,it,expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { exercises,starterRoutines,startSession,logSet,finishSession,sessionVolume,progress,weeklyVolume,metEnergy,metFor,normalizeSearch,searchExercises,parseHealthFile,toHealthFile,GOS_DATASET_NONE,validateWorkout,validateDietaryProfile,target,ulid,displayToKg,kgToDisplay } from './training';
const subject=`subj_${ulid()}`;
function fixture(){let a=startSession({id:'test',name:'Press',exercises:[target('bench-press')]},70);a.startedAt='2026-10-01T10:00:00Z';a=logSet(a,{reps:8,weightKg:60});return finishSession(a,subject,'2026-10-01T10:30:00Z');}
const mods=import.meta.glob('../../vendor/health-contract/schemas/v1/**/*.json',{eager:true,import:'default'}) as Record<string,any>;
const ajv=new Ajv2020({allErrors:true,strict:true});addFormats(ajv,{mode:'full'});
for(const [k,v] of Object.entries(mods))if(/v1\/[a-z-]+\.schema\.json$/.test(k))ajv.addSchema(v);
const validate=ajv.getSchema('https://gos.swal.network/schemas/ecosystem/v1/workout-session.schema.json')!;
const fx=(dir:string):[string,any][]=>Object.entries(mods).filter(([k])=>k.includes(`/fixtures/${dir}/workout-session-`)).map(([k,v])=>[k.split('/').pop()!,v]);
describe('Catalog and search',()=>{
 it('contains 302 unique translated catalog refs and 3 real starters',()=>{expect(exercises).toHaveLength(302);expect(new Set(exercises.map(e=>e.id)).size).toBe(302);expect(exercises.every(e=>e.name_es&&e.difficulty_source==='heuristic'&&e.muscleGroup)).toBe(true);expect(starterRoutines).toHaveLength(3);expect(starterRoutines.every(r=>r.exercises.every(x=>exercises.some(e=>e.id===x.ref)))).toBe(true);});
 it('normalizes Spanish accents, whitespace and case',()=>{expect(normalizeSearch('  GLÚTEOS  ')).toBe('gluteos');expect(searchExercises('gluteos').length).toBeGreaterThan(0);expect(searchExercises('SENTADILLA')).toEqual(searchExercises('sentadilla'));});
 it('searches English and Spanish and combines filters',()=>{expect(searchExercises('bench press').some(e=>e.slug==='bench-press')).toBe(true);expect(searchExercises('press','chest','Barbell','weight_reps').every(e=>e.muscleGroup==='chest'&&e.equipment==='Barbell'&&e.exerciseType==='weight_reps')).toBe(true);expect(searchExercises('xyzxyz')).toEqual([]);});
});
describe('Session logging',()=>{
 it('logs immutably and sets the rest deadline',()=>{const s=startSession(starterRoutines[0],70);const next=logSet(s,{reps:10});expect(s.exercises[0].sets).toEqual([]);expect(next.exercises[0].sets).toEqual([{reps:10}]);expect(next.restUntil).toBeGreaterThan(Date.now());});
 it.each([{reps:0},{reps:1.2},{reps:NaN},{reps:10,weightKg:-1}])('rejects invalid set %j',set=>{expect(()=>logSet(startSession(starterRoutines[0],70),set)).toThrow();});
 it('requires modality-specific values',()=>{expect(()=>logSet(startSession({id:'x',name:'Run',exercises:[target('running')]},70),{reps:10})).toThrow();expect(()=>logSet(startSession({id:'x',name:'Run',exercises:[target('running')]},70),{durationS:100})).toThrow();expect(logSet(startSession({id:'x',name:'Run',exercises:[target('running')]},70),{durationS:100,distanceM:400}).exercises[0].sets).toHaveLength(1);});
 it('does not save empty exercises or finish without logs',()=>{expect(()=>finishSession(startSession(starterRoutines[0],70),subject)).toThrow();const s=logSet(startSession(starterRoutines[0],70),{reps:10});expect(finishSession(s,subject).data.exercises).toHaveLength(1);});
 it('converts lb at the input boundary while retaining canonical kg',()=>{expect(displayToKg(kgToDisplay(60,'lb'),'lb')).toBeCloseTo(60);});
});
describe('Progress',()=>{
 it('calculates external volume and best weight over time',()=>{const a=fixture();expect(sessionVolume(a)).toBe(480);expect(progress([a],'wg:bench-press')[0]).toMatchObject({volume:480,best:60,bestReps:8});expect(progress([a],'wg:squat')).toEqual([]);});
 it('aggregates Monday-based UTC weeks, including year boundaries',()=>{const a=fixture();const b=structuredClone(a);b.data.startedAt='2026-10-04T23:00:00Z';expect(weeklyVolume([a,b])).toEqual([{date:'2026-09-28',volume:960}]);b.data.startedAt='2026-10-05T00:00:00Z';expect(weeklyVolume([a,b])).toHaveLength(2);});
});
describe('MET energy',()=>{
 it('uses documented formula and MET mappings',()=>{expect(metEnergy(3.5,70,1800)).toBe(129);expect(metFor(exercises.find(e=>e.slug==='childs-pose')!)).toBe(2.3);expect(metFor(exercises.find(e=>e.slug==='push-up')!)).toBe(3);expect(fixture().data.energy).toEqual({kcal:129,method:'met-estimate'});});
 it('rejects invalid mass and time',()=>{expect(()=>metEnergy(3.5,0,10)).toThrow();expect(()=>metEnergy(3.5,70,-10)).toThrow();expect(()=>metEnergy(NaN,70,10)).toThrow();});
});
describe('Health v1 contract',()=>{
 it.each(fx('valid'))('vendored valid fixture %s passes parseHealthFile and Ajv',(_n,r)=>{expect(validate(r)).toBe(true);expect(()=>validateWorkout(r)).not.toThrow();expect(parseHealthFile(JSON.stringify([r]))).toEqual([r]);});
 it.each(fx('invalid'))('vendored invalid fixture %s is rejected by the app',(_n,r)=>{expect(validate(r)).toBe(false);expect(()=>validateWorkout(r)).toThrow();});
 it('export conforms to the JSON Schema mirrored from CONTRATO-DATOS.md',()=>{const r=fixture();expect(validate(r),JSON.stringify(validate.errors)).toBe(true);expect(r.id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);expect(parseHealthFile(toHealthFile([r]))).toEqual([r]);});
 it.each(['id','subject','schema','createdAt','source','gosDataset','data'])('rejects a missing envelope field %s',field=>{const r:any=fixture();delete r[field];expect(validate(r)).toBe(false);expect(()=>validateWorkout(r)).toThrow();});
 it('schema and validator reject malformed sets and energy',()=>{const r=fixture();r.data.exercises[0].sets=[{reps:-1}];expect(validate(r)).toBe(false);expect(()=>validateWorkout(r)).toThrow();r.data.exercises[0].sets=[{reps:8}];r.data.energy!.kcal=-1;expect(validate(r)).toBe(false);expect(()=>validateWorkout(r)).toThrow();});
 it('rejects reversed timestamps and non-array transport',()=>{const r=fixture();r.data.endedAt='2026-09-01T00:00:00Z';expect(()=>validateWorkout(r)).toThrow();expect(()=>parseHealthFile(JSON.stringify(fixture()))).toThrow();});
 it('imports the optional dietary profile and rejects malformed GOS refs',()=>{const r={schema:'swal.health/v1/dietary-profile',id:ulid(),subject,createdAt:new Date().toISOString(),source:{app:'orionhealth',version:'1.0.0'},gosDataset:GOS_DATASET_NONE,data:{allergens:['gos:allergen/peanut'],diets:['gos:diet/mediterranean'],targets:{proteinGPerDay:140},expiresAt:'2027-01-01T00:00:00Z'}};expect(()=>validateDietaryProfile(r)).not.toThrow();expect(parseHealthFile(JSON.stringify([r]))).toEqual([r]);r.data.allergens=['peanut'];expect(()=>validateDietaryProfile(r)).toThrow();});
});
