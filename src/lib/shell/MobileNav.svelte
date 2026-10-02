<script lang="ts">
  import Icon from './Icon.svelte';
  let { brandName='SWAL Training', open=$bindable(false), menuLabel='Menú' }:{brandName?:string;open?:boolean;menuLabel?:string}=$props();
  export function close(){open=false;}
</script>
<svelte:window onkeydown={(e)=>{if(e.key==='Escape')open=false;}} />
<div class="nav-bar"><strong>{brandName}</strong><button type="button" aria-controls="nav-principal" aria-expanded={open} onclick={()=>open=!open}><Icon name={open?'close':'menu'}/>{menuLabel}</button></div>
<style>.nav-bar{display:flex;align-items:center;justify-content:space-between;min-height:52px;gap:1rem}button{display:flex;align-items:center;gap:.5rem}</style>
