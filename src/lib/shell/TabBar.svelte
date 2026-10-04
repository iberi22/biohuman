<!--
  Bottom tab bar with a contextual central action.

  Adapted from openGym's `TabBar.jsx` (https://github.com/DuarteSantos8/openGym,
  AGPL-3.0-or-later, Copyright (C) 2026 Duarte Santos). See NOTICE.md.

  The decision logic lives in `src/lib/domain/tabbar.ts` and is tested there; this
  file is markup only. That split is the point: what the middle button says depends
  on whether a session is running and which screen you are on, and that is exactly the
  kind of rule that should be verifiable without a browser.

  Note for anyone templating this later: in openGym the tab component had to be
  declared at module scope because defining it inside render made React rebuild every
  button once a second for the length of a rest timer, throwing away focus and the
  :active tint with it. Svelte has no equivalent trap here — the each block keys on
  `tab.key` — but do not introduce a wrapper that recreates buttons per tick.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { isTabActive, startAction, type ActiveSession, type TabKey } from '../domain/tabbar';

  let {
    route = '',
    active = null,
    labels = {},
    onNavigate = (_href: string) => {},
    onStart = (_routines: string[] | null) => {},
  }: {
    /** Current route, without the leading slash. */
    route?: string;
    /** The session in progress, or null when there is none. */
    active?: ActiveSession | null;
    /** UI strings; defaults are the Spanish ones this app ships. */
    labels?: Partial<Record<'home' | 'plan' | 'stats' | 'library' | 'start' | 'resume' | 'workout' | 'edit', string>>;
    onNavigate?: (href: string) => void;
    onStart?: (routines: string[] | null) => void;
  } = $props();

  const T: { key: TabKey; href: string }[] = [
    { key: 'home', href: '/' },
    { key: 'plan', href: '/rutinas' },
    { key: 'stats', href: '/historial' },
    { key: 'library', href: '/biblioteca' },
  ];

  const t = (k: keyof NonNullable<typeof labels>, fallback: string) => labels[k] ?? fallback;
  const start = $derived(startAction(route, active));
  const startLabel = $derived(
    start.label === 'Start'
      ? t('start', 'Entrenar')
      : start.label === 'Resume'
        ? t('resume', 'Continuar')
        : start.label === 'Edit workout'
          ? t('edit', 'Editar sesión')
          : t('workout', 'Entrenamiento'),
  );
</script>

<nav id="tabbar" aria-label="Principal">
  {#each T.slice(0, 2) as tab (tab.key)}
    <button type="button" class:on={isTabActive(tab.key, route)} onclick={() => onNavigate(tab.href)}>
      <Icon name={tab.key === 'home' ? 'house' : 'calendar'} size={22} />
      <span>{tab.key === 'home' ? t('home', 'Inicio') : t('plan', 'Plan')}</span>
    </button>
  {/each}

  <!-- On the workout screen itself there is nothing to resume, so the button reads as
       the tab it is and stays lit; anywhere else it brings you back to the exercise
       you were on. -->
  <button type="button" class="start" class:rec={start.resume} class:on={start.on} onclick={() => onStart(null)}>
    <span class="cir"><Icon name={start.icon} size={22} /></span>
    <span>{startLabel}</span>
  </button>

  {#each T.slice(2) as tab (tab.key)}
    <button type="button" class:on={isTabActive(tab.key, route)} onclick={() => onNavigate(tab.href)}>
      <Icon name={tab.key === 'stats' ? 'chart' : 'list'} size={22} />
      <span>{tab.key === 'stats' ? t('stats', 'Progreso') : t('library', 'Ejercicios')}</span>
    </button>
  {/each}
</nav>

<style>
  /* Mobile-first: the bar exists below the sidebar breakpoint only. */
  #tabbar {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 30;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    align-items: center;
    min-height: 56px;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--swal-surface);
    border-top: 1px solid var(--swal-border);
  }
  #tabbar button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    min-height: 56px;
    padding: 0.25rem;
    font-size: 0.68rem;
    color: var(--swal-text-secondary);
  }
  #tabbar button.on {
    color: var(--swal-text);
    font-weight: 600;
  }
  /* The central action sits above the bar so it reads as the primary control. */
  #tabbar .start .cir {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    margin-top: -14px;
    border-radius: 50%;
    background: var(--swal-accent);
    color: var(--swal-on-accent);
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.25);
  }
  #tabbar .start.rec .cir {
    background: var(--swal-danger, var(--swal-accent));
  }
  #tabbar .start.on .cir {
    outline: 2px solid var(--swal-accent);
    outline-offset: 2px;
  }
  /* Targets stay finger-sized; the labels wrap rather than truncate. */
  #tabbar button span {
    text-align: center;
    line-height: 1.1;
  }
  @media (min-width: 769px) {
    #tabbar {
      display: none;
    }
  }
</style>