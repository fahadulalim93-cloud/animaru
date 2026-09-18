<script lang="ts">
  import Sidebar from '$lib/components/Sidebar.svelte';
  import HeroBanner from '$lib/components/HeroBanner.svelte';
  import AnimeRow from '$lib/components/AnimeRow.svelte';
  import type { AnimeWithTMDB } from '$lib/tmdb';

  let { data } = $props();
  // data.trending/recent/popular are now AnimeWithTMDB[] (TMDB images + AniList info)
</script>

<svelte:head>
  <title>Animaru — Watch Anime Free in HD</title>
  <meta name="description" content="Stream anime online in HD with English sub & dub. Browse trending, popular, and recently added anime." />
</svelte:head>

<div class="app">
  <Sidebar />
  <main class="main">
    <HeroBanner anime={data.trending} />
    <div class="rows">
      <AnimeRow title="Recently Added" anime={data.recent} />
      <AnimeRow title="Popular Now" anime={data.popular} />
      <AnimeRow title="Trending" anime={data.trending} />
    </div>
  </main>
</div>

<style>
  .app { min-height: 100vh; background: #0a0a0a; }
  .main { margin-left: 72px; }
  .rows { padding: 32px 0 80px; }
</style>
