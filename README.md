# BioHuman

[![CI](https://github.com/iberi22/biohuman/actions/workflows/ci.yml/badge.svg)](https://github.com/iberi22/biohuman/actions/workflows/ci.yml)

PWA de entrenamiento local-first del ecosistema de salud SWAL. Astro 7 + Svelte 5 + @swal/ui (Bone Warm Minimalist), desplegable en Cloudflare. Rutinas, sesiones, perfil dietario consentido y ajustes permanecen en IndexedDB; no se envían al backend.

## Security

Please refer to our [Security Policy](SECURITY.md) for information on supported versions and how to report vulnerabilities.

## Desarrollo

Requiere Node 24+ y pnpm 11. `@swal/ui` y `@swal/vault` se consumen del registro npm (no hay dependencias `file:`), así que el repositorio instala y construye en cualquier clon.

```sh
xavier exec "pnpm install --offline"
xavier exec "pnpm dev --port 4327"
xavier exec "pnpm check"
xavier exec "pnpm test"
xavier exec "pnpm build"
xavier exec "pnpm test:e2e"
```

Astro 7 detecta agentes y arranca dev en segundo plano. Para ver un error de arranque: `.astro/dev.log`; para parar: `xavier exec "pnpm exec astro dev stop"`. El smoke sirve el build prerenderizado con Python 3 (ejecutar build primero) y usa Chromium local, sin descargar navegadores; en NixOS usa el Chromium del sistema o PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. La compatibilidad de Wrangler es 2026-09-04, soportada por el workerd instalado. El despliegue lo hace `.github/workflows/deploy.yml` en cada push a `main` (requiere los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`); no hay push automático de código.

## Funciones

- `/`: 302 ejercicios, búsqueda es/en sin acentos y filtros por músculo, equipo y modalidad.
- `/biblioteca/<slug>`: silueta inline currentColor de tres frames, con movimiento reducido respetado, músculos, equipo y dificultad heurística.
- `/rutinas`: editor con orden y objetivos (series, reps, peso, duración, distancia y descanso); Full body principiante, Push/Pull/Legs y Movilidad 15 min.
- `/entrenar`: series por modalidad, descanso con deadline persistente, recuperación tras recarga y finalización guardada.
- `/historial`: sesiones, mejores valores por serie, volumen externo por ejercicio en SVG y volumen semanal (lunes UTC).
- `/intercambio`: arrays `.swalhealth.json`, deduplicación por ULID, restauración de sujeto en dispositivos vacíos con consentimiento, deep link OrionHealth gzip/base64url (máximo 8 KB), perfil dietario opcional con aceptación explícita.
- `/ajustes`: tema claro/oscuro/sistema, kg/lb, español/inglés, masa corporal para MET.
- `/creditos`: licencias, modificaciones del arte y fuente MET.

## Arquitectura y datos

`src/lib/domain.ts` conserva la API CRUD de la plantilla. `localStorageAdapter.ts` la conecta a IndexedDB, sin fallback silencioso a memoria. `repository.ts` persiste documentos locales para rutinas, sesiones, sesión activa, preferencias y perfil. `training.ts` contiene lógica pura, ULID, progreso, validación y transporte.

El shell provisional vive en `src/lib/shell/{AppShell,Icon,MobileNav}.svelte`, con props de marca/ruta/ticker/children de Fize y navegación configurable. Usa tokens y Button/Badge/Toaster de @swal/ui. Un único TODO señala el futuro cambio al import del core; la extracción todavía no forma parte de esta rama.

Contrato: [docs/CONTRACT.md](docs/CONTRACT.md). La validación, exportación y deep link usan el paquete canónico vendorizado en `vendor/health-contract` (VENDORED_FROM: GOS salud/e2 34b15de0, con esquemas y fixtures); no se edita aquí. Esta app no calcula nutrientes, así que `gosDataset` fija el manifest nulo `0.0.0+sha256:000…0` (pendiente confirmar convención en el contrato). Fuente y método MET: [docs/MET.md](docs/MET.md), [Adult Compendium 2024](https://pacompendium.com/adult-compendium/).

## Catálogo y licencias

Se incluyen **906 SVG** vendorizados: la aplicación no usa CDN. Para regenerar desde el clon auditado:

```sh
WORKOUT_GUIDE_PATH=/ruta/workout-guide node scripts/vendor-exercises.mjs
```

El script exige 302 entradas y 302 traducciones (`scripts/names-es.txt`), minifica con SVGO, cambia `fill="#fff"` a `currentColor` y genera `src/data/exercises.json`. Conserva músculo original, jerarquía normalizada, provenance y `difficulty_source: heuristic`. Upstream: @bryllim/workout-guide 1.0.0, commit aac5992. El catálogo y SVG se versionan; no es necesario el clon para construir.

**Art © Bryl Lim, based on Everkinetic, CC BY-SA 4.0.** Adaptaciones bajo la misma licencia, código upstream MIT. Véase [LICENSES.md](LICENSES.md) y [atribución](public/exercises/ATTRIBUTION.md).

## Offline y límites

La PWA registra `/registerSW.js`; páginas prerenderizadas y JS/CSS se precachean. La navegación offline usa index.html como fallback y resuelve la sección según la URL al hidratar. Los SVG se cargan por ejercicio y se guardan CacheFirst (906 máximo), evitando descargar 28 MB al instalar. Una ilustración necesita haberse abierto en línea para quedar disponible offline; el registro de entrenamiento continúa sin ella.

La estimación MET utiliza tiempo total con descansos, la masa de Ajustes (70 kg inicial) y una media de modalidades; no modela intensidad/velocidad. No hay instrucciones técnicas verificadas en upstream. Yjs, mesh y @swal/vault de la plantilla están disponibles pero no se activa sincronización de salud; cifrado/mesh es una fase posterior del contrato. IndexedDB no está cifrado en este MVP. Se recomienda una pestaña de edición: el repositorio actual no fusiona ediciones concurrentes entre pestañas.

No se fija URL HTTPS de OrionHealth porque el contrato no especifica el dominio de producción. Se genera el URI Android `orionhealth://import?p=…`; probar la recepción real requiere OrionHealth. El perfil expirado se identifica y puede eliminarse; no participa en recomendaciones ni cálculo nutricional.


## Pendiente

- Cambiar el shell local (`src/lib/shell`) por `AppShell`/`MobileNav`/`Icon` de `@swal/ui` cuando el core con shell (salud/c2) esté en la rama canónica; `@swal/ui` 0.2.0, el paquete publicado, todavía no exporta ese shell.
- Sin backend en la ruta crítica: todo funciona offline con IndexedDB; la nube (vault/billing) sería una suscripción opcional y el mesh P2P de la plantilla se conserva en `src/lib/mesh.ts`.

## Estado de features

El seguimiento detallado de capacidades y madurez del proyecto se gestiona en [.gitcore/features.json](.gitcore/features.json) bajo el estándar GitCore.

Resumen del ledger (2026-10-15):
- **Total features**: 28
- **Implementadas (`implemented`)**: 22 (verificadas contra código; suite vitest 505/505 en verde el 2026-10-15)
- **En progreso (`in_progress`)**: 3 (PRs draft #12 y #13, y suite de humo tester-army/e2e)
- **Parciales (`partial`)**: 1 (CI en rama main, bloqueado por facturación en GitHub Actions de repos privados)
- **Planificadas (`planned`)**: 2 (despliegue público en biohuman.swal.network y retiro del scaffold de facturación)
- **Bloqueadores de lanzamiento (`launch_blocker: true`)**: 3 (despliegue público, CI en main, suite tester-army)

