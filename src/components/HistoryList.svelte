<script lang="ts">
  import { Badge, Button } from '@swal/ui';
  import { entriesForExercise } from '../lib/domain/history';
  import type { Workout, Preferences, Exercise } from '../lib/training';

  let {
    sessions,
    exercises,
    prefs,
    kgToDisplay,
    sessionVolume,
    n,
    name,
    onexport,
    onorion,
  }: {
    sessions: Workout[];
    exercises: Exercise[];
    prefs: Preferences;
    kgToDisplay: (kg: number, units: 'kg'|'lb') => number;
    sessionVolume: (s: Workout) => number;
    n: (count: number, single: string[], plural: string[]) => string;
    name: (id: string) => string;
    onexport: (s: Workout[]) => void;
    onorion: (s: Workout[]) => void;
  } = $props();

  const t = (es: string, en: string) => (prefs.language === 'en' ? en : es);
</script>

<div class="stack">
  {#if !sessions.length}
    <div class="panel stack">
      <h2>{t('Cada comienzo cuenta.', 'Every beginning counts.')}</h2>
      <p class="muted">{t('Al finalizar tu primera sesión, verás aquí tu progreso.', 'Finish your first session to see your progress here.')}</p>
      <a href="/rutinas">{t('Empezar una rutina', 'Start a routine')} →</a>
    </div>
  {:else}
    {#each sessions as s}
      <article class="panel stack">
        <div class="row between">
          <h2>{new Date(s.data.startedAt).toLocaleString(prefs.language)}</h2>
          <Badge variant="neutral">{n(s.data.exercises.reduce((v, e) => v + e.sets.length, 0), ['serie', 'series'], ['set', 'sets'])}</Badge>
        </div>
        <div class="row muted">
          <span>{Math.round((Date.parse(s.data.endedAt) - Date.parse(s.data.startedAt)) / 60000)} min</span>
          <span>{kgToDisplay(sessionVolume(s), prefs.units).toFixed(0)} {prefs.units} × reps</span>
          {#if s.data.energy}
            <span>≈ {s.data.energy.kcal} kcal · met-estimate</span>
          {/if}
        </div>
        <ul>
          {#each s.data.exercises as e}
            <li>{exercises.some(x => x.id === e.ref) ? name(e.ref) : e.ref} · {n(entriesForExercise(s as unknown as Parameters<typeof entriesForExercise>[0], e.ref).length || e.sets.length, ['serie', 'series'], ['set', 'sets'])}</li>
          {/each}
        </ul>
        {#if s.data.notes}
          <p>{s.data.notes}</p>
        {/if}
        <div class="row">
          <Button variant="secondary" onclick={() => onexport([s])}>{t('Exportar sesión', 'Export session')}</Button>
          <Button variant="ghost" onclick={() => onorion([s])}>{t('Enviar a OrionHealth', 'Send to OrionHealth')}</Button>
        </div>
      </article>
    {/each}
  {/if}
</div>

<style>
  .stack { display: flex; flex-direction: column; gap: 1rem; }
  .panel { padding: 1.5rem; background: var(--swal-surface); border: 1px solid var(--swal-border); border-radius: 8px; }
  .row { display: flex; align-items: center; gap: 1rem; }
  .between { justify-content: space-between; }
  .muted { color: var(--swal-muted); font-size: 0.9rem; }
  h2 { margin: 0; font-size: 1.25rem; }
  p, ul { margin: 0.5rem 0; line-height: 1.5; }
  ul { padding-left: 1.2rem; }
  a { color: var(--swal-primary); text-decoration: none; font-weight: 500; }
  a:hover { text-decoration: underline; }
</style>
