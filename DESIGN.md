# SWAL Training — Bone Warm Minimalist

Reference (read-only): Fize `feat/redesign-visual`, `src-astro/src/layouts/BaseLayout.astro`, `components/{DashboardShell,Icon,Landing}.svelte`, `components/icons.ts` (the requested lib/icons.ts path does not exist on that ref).

Use @swal/ui tokens and components. Light background #FAF9F5, text #1C1917; dark background #121211, text #F5F5F4. Accent equals text. Stone grey secondary copy, translucent glass panels with 16px blur, 1px stone borders. System sans; mono only for numbers/data. No emoji icons: 24×24 SVG paths, 1.75 stroke, currentColor.

Desktop: sidebar and topbar, active navigation with inset accent stripe, flexible content. Mobile <=768px: sticky current/brand bar, hamburger, expandable two-column navigation; content fits 390px. Controls >=44px, visible keyboard focus, reduced motion respected. Loading, empty, error and persistence states are explicit. Catalog artwork is separate from interface icons; filled silhouettes use inline currentColor.

The shell is temporarily local until the Fize extraction reaches @swal/ui. It retains AppShell/Icon/MobileNav names and brandName/currentPath/tickerMessage/children props, adds configurable app nav. The dashboard content adapts to training; no claim of pixel-identical restaurant dashboard content.
