<script lang="ts">
  import { onMount } from 'svelte';
  import Play from 'lucide-svelte/icons/play';
  import Info from 'lucide-svelte/icons/info';
  import Heart from 'lucide-svelte/icons/heart';
  import ChevronLeft from 'lucide-svelte/icons/chevron-left';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import CalendarIcon from 'lucide-svelte/icons/calendar';
  import Film from 'lucide-svelte/icons/film';
  import type { AnimeMedia } from '$lib/anilist';

  let { anime }: { anime: AnimeMedia[] } = $props();
  let index = $state(0);
  let paused = $state(false);
  let timer: ReturnType<typeof setInterval>;

  $effect(() => {
    if (paused || anime.length <= 1) return;
    timer = setInterval(() => {
      index = (index + 1) % anime.length;
    }, 8000);
    return () => clearInterval(timer);
  });

  function next() { index = (index + 1) % anime.length; }
  function prev() { index = (index - 1 + anime.length) % anime.length; }

  let current = $derived(anime[index] ?? anime[0]);
  let title = $derived(current?.title?.english || current?.title?.romaji || '');
  let banner = $derived(current?.bannerImage || current?.coverImage?.extraLarge || '');
  let description = $derived((current?.description || '').replace(/<[^>]+>/g, '').slice(0, 200));
</script>

{#if current}
  <div
    class="hero"
    onmouseenter={() => (paused = true)}
    onmouseleave={() => (paused = false)}
  >
    <!-- Background layers -->
    <div class="bg-layer">
      {#each anime as a, i (a.id)}
        <div
          class="bg-image"
          style="background-image: url({a.bannerImage || a.coverImage.extraLarge}); opacity: {i === index ? 1 : 0};"
        ></div>
      {/each}
      <div class="gradient-bottom"></div>
      <div class="gradient-left"></div>
    </div>

    <!-- Top bar -->
    <div class="top-bar">
      <div class="search-bar">
        <input type="text" placeholder="Search anime..." />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </div>
      <button class="sign-in">
        Sign In
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="content">
      <h1 class="title">
        {title.split(' ').slice(0, -1).join(' ')}
        <span class="accent">{title.split(' ').slice(-1)}</span>
      </h1>

      <div class="meta">
        <span class="status">{current.status === 'RELEASING' ? 'Releasing' : current.status}</span>
        <span class="meta-item">
          <CalendarIcon size={14} />
          {current.season ? `${current.season} ${current.seasonYear}` : current.seasonYear}
        </span>
        {#if current.episodes}
          <span class="meta-item">
            <Film size={14} />
            {current.episodes} Episodes
          </span>
        {/if}
      </div>

      <p class="synopsis">{description}</p>

      <div class="buttons">
        <button class="btn-primary">
          <Play size={18} fill="currentColor" />
          Watch Now
        </button>
        <button class="btn-secondary"><Info size={18} /></button>
        <button class="btn-secondary"><Heart size={18} /></button>
      </div>

      <div class="indicators">
        {#each anime as _, i (i)}
          <button
            class="indicator"
            class:active={i === index}
            onclick={() => (index = i)}
          ></button>
        {/each}
      </div>
    </div>

    <!-- Nav arrows -->
    <button class="nav-arrow" onclick={prev}><ChevronLeft size={20} /></button>
    <button class="nav-arrow right" onclick={next}><ChevronRight size={20} /></button>
  </div>
{/if}

<style>
  .hero {
    position: relative;
    height: 70vh;
    min-height: 500px;
    width: 100%;
    overflow: hidden;
  }
  .bg-layer { position: absolute; inset: 0; }
  .bg-image {
    position: absolute; inset: 0;
    background-size: cover; background-position: center 25%;
    transition: opacity 1s ease;
  }
  .gradient-bottom {
    position: absolute; inset: 0;
    background: linear-gradient(to top, #000, rgba(0,0,0,0.4) 60%, transparent);
  }
  .gradient-left {
    position: absolute; inset: 0;
    background: linear-gradient(to right, rgba(0,0,0,0.85), transparent 60%);
  }

  .top-bar {
    position: absolute; top: 0; left: 0; right: 0; z-index: 20;
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 32px;
  }
  .search-bar {
    display: flex; align-items: center; gap: 8px;
    background: rgba(0,0,0,0.5); backdrop-filter: blur(12px);
    border-radius: 999px; padding: 10px 20px;
    border: 1px solid rgba(255,255,255,0.1);
    max-width: 400px; width: 100%; margin: 0 auto;
  }
  .search-bar input {
    flex: 1; background: transparent; border: none; outline: none;
    color: white; font-size: 14px;
  }
  .search-bar input::placeholder { color: #999; }
  .sign-in {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 20px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.2);
    background: transparent; color: white; font-size: 14px;
    cursor: pointer; transition: all 0.2s;
  }
  .sign-in:hover { background: rgba(255,255,255,0.1); }

  .content {
    position: absolute; bottom: 0; left: 0; right: 0; z-index: 10;
    padding: 0 32px 40px; max-width: 640px;
  }
  .title {
    font-size: 48px; font-weight: 800; color: white; line-height: 1.1;
    margin: 0 0 12px;
  }
  .accent { color: #3b82f6; }
  .meta {
    display: flex; align-items: center; gap: 16px;
    margin-bottom: 12px; font-size: 14px;
  }
  .status {
    color: #4ade80; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.5px; font-size: 13px;
  }
  .meta-item { display: flex; align-items: center; gap: 6px; color: #d1d5db; }
  .synopsis {
    color: #9ca3af; font-size: 15px; line-height: 1.6;
    margin: 0 0 20px; max-width: 600px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .buttons { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .btn-primary {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 24px; background: white; color: black;
    font-weight: 700; border-radius: 8px; border: none;
    cursor: pointer; font-size: 14px; transition: all 0.2s;
  }
  .btn-primary:hover { opacity: 0.9; }
  .btn-secondary {
    width: 40px; height: 40px; border-radius: 8px;
    background: rgba(255,255,255,0.1); backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.1); color: white;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
  }
  .btn-secondary:hover { background: rgba(255,255,255,0.2); }
  .indicators { display: flex; align-items: center; gap: 8px; }
  .indicator {
    height: 3px; border-radius: 999px; border: none;
    background: rgba(255,255,255,0.3); width: 16px; cursor: pointer;
    transition: all 0.3s;
  }
  .indicator.active { background: white; width: 32px; }

  .nav-arrow {
    position: absolute; right: 16px; top: 50%; transform: translateY(-50%);
    z-index: 10; width: 40px; height: 40px; border-radius: 999px;
    background: rgba(0,0,0,0.4); backdrop-filter: blur(8px);
    border: none; color: white; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
  }
  .nav-arrow:hover { background: rgba(0,0,0,0.6); }
  .nav-arrow.right { right: 16px; }
  .nav-arrow:not(.right) { right: auto; left: calc(100% - 56px); }
</style>
