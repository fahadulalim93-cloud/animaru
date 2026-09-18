<script lang="ts">
  import ChevronLeft from 'lucide-svelte/icons/chevron-left';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import AnimeCard from './AnimeCard.svelte';
  import type { AnimeMedia } from '$lib/anilist';

  let { title, anime }: { title: string; anime: AnimeMedia[] } = $props();
  let scrollEl: HTMLDivElement;

  function scroll(dir: 'left' | 'right') {
    if (!scrollEl) return;
    scrollEl.scrollBy({ left: dir === 'left' ? -600 : 600, behavior: 'smooth' });
  }
</script>

{#if anime.length}
  <section class="row">
    <div class="header">
      <h2>{title}</h2>
      <div class="arrows">
        <button onclick={() => scroll('left')}><ChevronLeft size={18} /></button>
        <button onclick={() => scroll('right')}><ChevronRight size={18} /></button>
      </div>
    </div>
    <div class="cards" bind:this={scrollEl}>
      {#each anime as a (a.id)}
        <AnimeCard anime={a} />
      {/each}
    </div>
  </section>
{/if}

<style>
  .row { margin-bottom: 32px; padding: 0 32px; }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 16px;
  }
  h2 { font-size: 20px; font-weight: 700; color: white; margin: 0; }
  .arrows { display: flex; gap: 8px; }
  .arrows button {
    width: 32px; height: 32px; border-radius: 999px;
    background: rgba(255,255,255,0.05); border: none;
    color: #9ca3af; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
  }
  .arrows button:hover { background: rgba(255,255,255,0.1); color: white; }
  .cards {
    display: flex; gap: 16px; overflow-x: auto;
    padding-bottom: 8px; scroll-behavior: smooth;
  }
  .cards::-webkit-scrollbar { display: none; }
  .cards { -ms-overflow-style: none; scrollbar-width: none; }
</style>
