<script lang="ts">
  import { Button } from '@swal/ui';
  import ExerciseArt from './ExerciseArt.svelte';
  import { searchExercises, equipmentOf, type CatalogueExercise } from '../lib/domain/catalogue';

  let {
    catalogue = [],
    initialQuery = '',
    initialMuscle = '',
    initialEquipment = '',
    initialType = ''
  }: {
    catalogue: CatalogueExercise[];
    initialQuery?: string;
    initialMuscle?: string;
    initialEquipment?: string;
    initialType?: string;
  } = $props();

  let query = $state(initialQuery);
  let muscle = $state(initialMuscle);
  let equipment = $state(initialEquipment);
  let type = $state(initialType);
  let visible = $state(24);

  const filtered = $derived(
    searchExercises(catalogue, query, { muscle, equipment, type })
  );

  const groups: Record<string, [string, string]> = {
    back: ['Espalda', 'Back'],
    legs: ['Piernas', 'Legs'],
    glutes: ['Glúteos y cadera', 'Glutes & hips'],
    chest: ['Pecho', 'Chest'],
    shoulders: ['Hombros', 'Shoulders'],
    arms: ['Brazos', 'Arms'],
    core: ['Abdominales', 'Core'],
    mobility: ['Movilidad', 'Mobility'],
    'posterior-chain': ['Cadena posterior', 'Posterior chain']
  };

  const types: Record<string, [string, string]> = {
    weight_reps: ['Peso y repeticiones', 'Weight & reps'],
    bodyweight_reps: ['Repeticiones', 'Reps'],
    assisted_bodyweight: ['Repeticiones asistidas', 'Assisted reps'],
    duration: ['Tiempo', 'Time'],
    distance_duration: ['Distancia y tiempo', 'Distance & time']
  };

  const eqEs: Record<string, string> = {
    Bodyweight: 'Peso corporal',
    Dumbbell: 'Mancuerna',
    Machine: 'Máquina',
    Barbell: 'Barra',
    Cable: 'Polea',
    'Resistance Band': 'Banda elástica',
    Cardio: 'Cardio',
    'Pull-up Bar': 'Barra de dominadas',
    Wall: 'Pared',
    Towel: 'Toalla',
    Plate: 'Disco',
    Kettlebell: 'Pesa rusa',
    Doorway: 'Marco de puerta',
    Box: 'Cajón',
    Bench: 'Banco',
    Chair: 'Silla',
    'Stability Ball': 'Balón de estabilidad'
  };

  const equipmentName = (eq: string) => eqEs[eq] ?? eq;

  // Simplistic translation for now, since this is a UI component only we use Spanish if needed.
  // Assuming a global or context language preference, but here we just show Spanish primarily for simplicity or match the TrainingApp logic.
  let language = 'es'; // Assuming Spanish as default based on codebase
  const t = (es: string, en: string) => (language === 'es' ? es : en);

  // Pluralization
  const n = (count: number, es: [string, string], en: [string, string]) =>
    `${count} ${count === 1 ? t(es[0], en[0]) : t(es[1], en[1])}`;

</script>

<section class="filters panel" aria-label={t('Filtros', 'Filters')}>
  <label>
    {t('Buscar ejercicios', 'Search exercises')}
    <input type="search" bind:value={query} oninput={() => (visible = 24)} placeholder={t('Sentadilla, press, espalda…', 'Squat, press, back…')} />
  </label>
  <label>
    {t('Grupo muscular', 'Muscle group')}
    <select bind:value={muscle} onchange={() => (visible = 24)}>
      <option value="">{t('Todos los músculos', 'All muscles')}</option>
      {#each Object.entries(groups) as [key, labels]}
        <option value={key}>{t(...labels)}</option>
      {/each}
    </select>
  </label>
  <label>
    {t('Equipo', 'Equipment')}
    <select bind:value={equipment} onchange={() => (visible = 24)}>
      <option value="">{t('Todo el equipo', 'All equipment')}</option>
      {#each equipmentOf(catalogue) as eq}
        <option value={eq}>{equipmentName(eq)}</option>
      {/each}
    </select>
  </label>
  <label>
    {t('Tipo', 'Type')}
    <select bind:value={type} onchange={() => (visible = 24)}>
      <option value="">{t('Todos los tipos', 'All types')}</option>
      {#each Object.entries(types) as [key, labels]}
        <option value={key}>{t(...labels)}</option>
      {/each}
    </select>
  </label>
</section>

<div class="row between result">
  <h2>{t('Biblioteca de ejercicios', 'Exercise library')}</h2>
  <small class="muted" aria-live="polite">
    {n(filtered.length, ['resultado', 'resultados'], ['result', 'results'])}
  </small>
</div>

<div class="exercise-grid">
  {#each filtered.slice(0, visible) as e}
    <a class="exercise-card panel" href={`/biblioteca/${e.slug}`}>
      <div class="silhouette">
        <ExerciseArt slug={e.slug} />
      </div>
      <div class="card-copy">
        <small class="muted">
          {e.muscleGroup && groups[e.muscleGroup as string] ? t(...groups[e.muscleGroup as string]) : (groups[e.bodyPart as string] ? t(...groups[e.bodyPart as string]) : e.bodyPart)} / {equipmentName(e.equipment)}
        </small>
        <h3>{language === 'es' && e.name_es ? e.name_es : e.name}</h3>
        <span class="muted">
          {t('Ver ejercicio', 'View exercise')} <span aria-hidden="true">↗</span>
        </span>
      </div>
    </a>
  {/each}
</div>

{#if !filtered.length}
  <p class="panel">
    {t('No hay resultados. Prueba otro término o elimina filtros.', 'No results. Try another term or clear filters.')}
  </p>
{/if}

{#if filtered.length > visible}
  <div class="more">
    <Button variant="secondary" onclick={() => (visible += 24)}>
      {t('Mostrar más', 'Show more')}
    </Button>
  </div>
{/if}

<style>
  .filters {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: .8rem;
    margin: 1.25rem 0;
  }
  .result {
    margin: 2rem 0 1rem;
  }
  .result h2 {
    margin: 0;
  }
  .exercise-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 1rem;
  }
  .exercise-card {
    text-decoration: none;
    padding: 0;
    overflow: hidden;
    transition: transform 150ms;
  }
  .exercise-card:hover {
    transform: translateY(-3px);
    border-color: var(--swal-border-strong);
  }
  .silhouette {
    padding: 1rem 2rem;
    border-bottom: 1px solid var(--swal-border);
    background: var(--swal-hover);
  }
  .card-copy {
    padding: 1rem;
  }
  .card-copy h3 {
    margin: .55rem 0 1rem;
  }
  .card-copy span {
    font-size: .75rem;
  }
  .more {
    display: flex;
    justify-content: center;
    margin: 2rem;
  }
  @media (max-width: 1000px) {
    .filters {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 650px) {
    .filters {
      grid-template-columns: 1fr;
    }
    .exercise-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: .6rem;
    }
    .exercise-card .silhouette {
      padding: .5rem;
    }
    .card-copy {
      padding: .75rem;
    }
    .card-copy small {
      font-size: .65rem;
    }
    .card-copy h3 {
      font-size: .9rem;
    }
  }
</style>
