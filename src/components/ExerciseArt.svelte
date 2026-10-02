<script lang="ts">
  import { onMount } from 'svelte';
  let { slug, animate=false }:{slug:string;animate?:boolean}=$props();
  let frames=$state<string[]>([]);let index=$state(0);let failed=$state(false);
  $effect(()=>{const current=slug;const controller=new AbortController();frames=[];index=0;failed=false;
    Promise.all([1,2,3].map(async n=>{const r=await fetch(`/exercises/${current}/frame-${n}.svg`,{signal:controller.signal});if(!r.ok)throw Error('Artwork');return r.text();})).then(f=>frames=f).catch(e=>{if(e.name!=='AbortError')failed=true;});return ()=>controller.abort();});
  onMount(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const timer=setInterval(()=>{if(animate&&!media.matches)index=(index+1)%3;},650);return ()=>clearInterval(timer);});
</script>
<div class="art" aria-hidden="true">{#if frames.length}{@html frames[index]}{:else}<span>{failed?'—':'· · ·'}</span>{/if}</div>
<style>.art{display:grid;place-items:center;width:100%;aspect-ratio:1;max-height:360px;color:var(--swal-text)}.art :global(svg){width:100%;height:100%;max-height:360px}</style>
