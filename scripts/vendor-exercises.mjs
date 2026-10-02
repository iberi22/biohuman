import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { optimize } from 'svgo';
const root = resolve(process.env.WORKOUT_GUIDE_PATH || '/tmp/claude-1000/-home-belal/45e84457-e412-47b7-b90a-5593f31622c4/scratchpad/workout-guide');
const manifest = JSON.parse(await readFile(`${root}/packages/workout-guide/manifest.json`, 'utf8'));
const names = (await readFile('scripts/names-es.txt', 'utf8')).trim().split('\n');
if (manifest.length !== 302 || names.length !== manifest.length) throw Error(`Catalog/name count: ${manifest.length}/${names.length}`);
const parents = { Back:'back', Lats:'back', 'Upper Back':'back', 'Lower Back':'back', Legs:'legs', Quads:'legs', Hamstrings:'legs', Calves:'legs', Adductors:'legs', Glutes:'glutes', Hips:'glutes', 'Posterior Chain':'posterior-chain', Shoulders:'shoulders', 'Rear Delts':'shoulders', Chest:'chest', Core:'core', Triceps:'arms', Biceps:'arms', Forearms:'arms', Mobility:'mobility' };
const data = [];
let count=0;
for (const [i,e] of manifest.entries()) {
  await mkdir(`public/exercises/${e.slug}`, { recursive:true });
  for (let n=1;n<=3;n++) {
    const raw = await readFile(`${root}/packages/workout-guide/assets/${e.slug}/frame-${n}.svg`, 'utf8');
    const svg = optimize(raw.replace(/fill="#fff"/gi, 'fill="currentColor"'), { multipass:true, plugins:[{ name:'preset-default', params:{ overrides:{ convertColors:false } } }] }).data;
    await writeFile(`public/exercises/${e.slug}/frame-${n}.svg`, svg); count++;
  }
  const difficulty = /handstand|pistol|dragon|archer|typewriter|nordic|shrimp|l-sit/.test(e.slug) ? 'advanced' : e.isStretch || ['Machine','Resistance Band','Wall','Chair'].includes(e.equipment) || ['walking','bodyweight-squat','knee-push-up','glute-bridge','dead-bug'].includes(e.slug) ? 'beginner' : 'intermediate';
  data.push({ id:`wg:${e.slug}`, originalId:e.id, slug:e.slug, name:e.name, name_es:names[i], exerciseType:e.exerciseType, equipment:e.equipment, primaryMuscle:e.primaryMuscle, secondaryMuscles:e.secondaryMuscles, muscleGroup:parents[e.primaryMuscle], musclePath:[parents[e.primaryMuscle], e.primaryMuscle.toLowerCase().replaceAll(' ','-')], isStretch:e.isStretch, difficulty, difficulty_source:'heuristic', attribution:e.attribution });
}
await mkdir('src/data', { recursive:true });
await writeFile('src/data/exercises.json', JSON.stringify(data,null,2)+'\n');
await copyFile(`${root}/LICENSE-ASSETS`, 'public/exercises/LICENSE-ASSETS');
await copyFile(`${root}/LICENSE`, 'public/exercises/LICENSE-MIT');
await writeFile('public/exercises/ATTRIBUTION.md', '# Exercise art\n\nArt © Bryl Lim, based on Everkinetic, CC BY-SA 4.0\n\nhttps://github.com/bryllim/workout-guide — version 1.0.0, commit aac5992.\nLicense: https://creativecommons.org/licenses/by-sa/4.0/\n\nChanges: SVGO minification and replacement of white fill (#fff) with currentColor for light/dark themes. Modified artwork remains CC BY-SA 4.0. Original source provenance is preserved per exercise in src/data/exercises.json. Code and artwork are separate works.\n');
await writeFile('LICENSES.md', '# Licenses\n\nExercise artwork: Art © Bryl Lim, based on Everkinetic, CC BY-SA 4.0. Vendored from @bryllim/workout-guide 1.0.0 (aac5992). Modified by SVGO minification and #fff → currentColor; adaptations retain CC BY-SA 4.0. See public/exercises/ATTRIBUTION.md and LICENSE-ASSETS. Upstream code: MIT, see public/exercises/LICENSE-MIT. @swal/ui: AGPL-3.0.\n');
console.log(`Vendored ${data.length} exercises, ${names.length} Spanish names, ${count} SVG frames.`);
