<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import MobileNav from './MobileNav.svelte';
  import type { IconName } from './icons';
  // TODO: Swap these shell imports to @swal/ui when the Fize extraction lands.
  let { currentPath='/', brandName='SWAL Training', tickerMessage='En este dispositivo', children, nav, menuLabel='Menú' }:{currentPath?:string;brandName?:string;tickerMessage?:string;children?:Snippet;nav:{href:string;label:string;icon:IconName}[];menuLabel?:string}=$props();
  let mobile:MobileNav;
  const active=(href:string)=>href==='/'?currentPath==='/':currentPath.startsWith(href);
</script>
<div class="app-shell">
  <aside class="sidebar">
    <div class="brand"><Icon name="home" size={24}/><span>{brandName}<small>SWAL / HEALTH</small></span></div>
    <div class="mobile"><MobileNav bind:this={mobile} {brandName} {menuLabel}/></div>
    <nav id="nav-principal" aria-label="Principal">
      {#each nav as item}<a href={item.href} class:active={active(item.href)} aria-current={active(item.href)?'page':undefined}><Icon name={item.icon} size={18}/>{item.label}</a>{/each}
    </nav>
    <footer><Icon name="device" size={16}/>{tickerMessage}</footer>
  </aside>
  <div class="content"><header class="topbar"><span>{nav.find(n=>active(n.href))?.label??brandName}</span><span class="muted">{tickerMessage}</span></header><main id="main">{@render children?.()}</main></div>
</div>
<style>
.app-shell{display:flex;min-height:100vh}.sidebar{width:220px;flex-shrink:0;background:var(--swal-surface);backdrop-filter:blur(16px) saturate(1.2);border-right:1px solid var(--swal-border);position:sticky;top:0;height:100vh;padding:1.5rem .5rem;display:flex;flex-direction:column}.brand{display:flex;gap:.75rem;padding:0 .75rem 2rem;font-weight:650}.brand small{display:block;font-size:.65rem;letter-spacing:.14em;color:var(--swal-text-secondary);margin-top:.4rem}nav{display:flex;flex-direction:column;gap:.125rem}nav a{display:flex;align-items:center;gap:.625rem;min-height:44px;padding:0 .75rem;border-radius:8px;color:var(--swal-text-secondary)!important;font-size:.875rem;text-decoration:none}nav a:hover{background:var(--swal-hover)}nav a.active{background:var(--swal-accent-muted);color:var(--swal-text)!important;font-weight:600;box-shadow:inset 3px 0 0 var(--swal-accent)}footer{margin-top:auto;display:flex;gap:.5rem;padding:1rem .75rem;font-size:.75rem;color:var(--swal-text-secondary)}.content{flex:1;min-width:0}.topbar{display:flex;justify-content:space-between;gap:1rem;border-bottom:1px solid var(--swal-border);padding:1rem 2rem;font-size:.8rem;background:var(--swal-surface);backdrop-filter:blur(16px)}main{max-width:1280px;margin:auto;padding:2rem}.mobile{display:none}
@media(max-width:768px){.app-shell{flex-direction:column}.sidebar{width:100%;height:auto;padding:.25rem .75rem;z-index:20;border-right:none;border-bottom:1px solid var(--swal-border)}.brand,footer,.topbar{display:none}.mobile{display:block}nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding-bottom:.5rem}.sidebar:has(:global(button[aria-expanded='false'])) nav{display:none}main{padding:1rem}}
</style>
