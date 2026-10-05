<!--
  Bottom tab bar with a contextual central action.

  Adapted from openGym's `TabBar.jsx` (https://github.com/DuarteSantos8/openGym,
  AGPL-3.0-or-later, Copyright (C) 2026 Duarte Santos). See NOTICE.md.

  The decision logic lives in `src/lib/domain/tabbar.ts` and is tested there; this file is
  markup only. That split is the point: what the middle button says depends on whether a session
  is running and which screen you are on, and that is exactly the kind of rule that should be
  verifiable without a browser.

  Landed but not mounted — see src/lib/domain/README.md. AppShell already gives mobile a
  collapsible menu with all seven destinations, so switching mobile to this bar is the owner's
  call, not the port's.

  Note for anyone templating this later: in openGym the tab component had to be declared at
  module scope because defining it inside render made React rebuild every button once a second
  for the length of a rest timer, throwing away focus and the :active tint with it. Svelte has no
  equivalent trap given the keyed each below — but do not introduce a wrapper that recreates the
  buttons per tick.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { isTabActive, startAction, type ActiveSession } from '../domain/tabbar';

  let {
    route = '',
    active = null,
    labels = {},
    onNavigate = () => {},
    onStart = () => {},
  }: {
    /** Current route, without the leading slash. */
    route?: string;
    /** The session in progress, or null when there is none. */
    active?: ActiveSession | null;
    /** UI strings; defaults are the Spanish this app ships. */
    labels?: Partial<Record<string, string>>;
    onNavigate?: (href: string) => void;
    onStart?: (routines: string[] | null) => void;
  } = $props();

  const TABS = [
    { key: 'home', href: '/', icon: 'house', label: 'Inicio' },
    { key: 'plan', href: '/rutinas', icon: 'calendar', label: 'Plan' },
    { key: 'stats', href: '/historial', icon: 'chart', label: 'Progreso' },
    { key: 'library', href: '/biblioteca', icon: 'list', label: 'Ejercicios' },
  ] as const;

  /** The central button splits the bar, so the tabs either side are named by position. */
  const [before, after] = [TABS.slice(0, 2), TABS.slice(2)];

  const t = (key: string) => labels[key];

  const START_LABEL: Record<string, string> = {
    Start: 'Entrenar',
    Resume: 'Continuar',
    'Edit workout': 'Editar sesión',
    Workout: 'Entrenamiento',
  };

  const start = $derived(startAction(route, active));
  const startLabel = $derived(t(START_LABEL[start.label]) ?? START_LABEL[start.label]);
</script>

<nav id="tabbar" aria-label="Principal">
  {#each before as tab (tab.key)}
    <button type="button" class:on={isTabActive(tab.key, route)} onclick={() => onNavigate(tab.href)}>
      <Icon name={tab.icon} size={22} />
      <span>{t(tab.label) ?? tab.label}</span>
    </button>
  {/each}

  <!-- On the workout screen itself there is nothing to resume, so the button reads as the tab it
       is and stays lit; anywhere else it brings you back to the exercise you were on. -->
  <button type="button" class="start" class:rec={start.resume} class:on={start.on} onclick={() => onStart(null)}>
    <span class="cir"><Icon name={start.icon} size={22} /></span>
    <span>{startLabel}</span>
  </button>

  {#each after as tab (tab.key)}
    <button type="button" class:on={isTabActive(tab.key, route)} onclick={() => onNavigate(tab.href)}>
      <Icon name={tab.icon} size={22} />
      <span>{t(tab.label) ?? tab.label}</span>
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
  /* Targets stay finger-sized; labels wrap rather than truncate. */
  #tabbar button span {
    text-align: center;
    line-height: 1.1;
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
    /* `--swal-on-accent` did not exist in the design system, so this resolved to
       an invalid value and the icon silently inherited the parent colour instead
       of being chosen for the surface it sits on.

       The token now exists in @swal/ui (core fix c443ce0, theme.css): it aliases
       --swal-accent-contrast, which measures 16.03:1 against the dark accent and
       16.64:1 against the light one. `--swal-text-inverse` also passes here, but
       it means "inverse of the theme's text" rather than "legible on the accent",
       so it is the wrong token even where it happens to work. */
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
  @media (min-width: 769px) {
    #tabbar {
      display: none;
    }
  }
</style>