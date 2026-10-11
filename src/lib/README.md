# BioHuman `src/lib`

BioHuman `src/lib` contains the core business logic and UI shell for the `biohuman` package.

## Domain & Porting

- **`domain/`**: Contains the pure functions ported from openGym. See `domain/README.md` for the porting rules, status, and the current list of ported modules.
- **`training.ts`**: The MVP session code that the pages use.

## Shell

The `shell/` directory holds the main application shell and navigation components:
- `AppShell.svelte`
- `MobileNav.svelte`
- `Icon.svelte`
- `icons.ts`
- `TabBar.svelte`

**Note:** `TabBar.svelte` is deliberately not mounted. Mobile navigation is an open decision, and `AppShell.svelte` has zero `TabBar` imports.

## Package Info

This is the `biohuman` package.
It operates under the AGPL-3.0-or-later license, as defined in the `package.json` file.
The version is currently 0.1.0.

## Scripts & Commands

Check the main `package.json` for details on building and testing this directory.
