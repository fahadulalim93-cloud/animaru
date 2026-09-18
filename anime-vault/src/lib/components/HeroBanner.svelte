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

  let { anime, banners }: { anime: AnimeMedia[]; banners?: Record<number, string> } = $props();
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
  let description = $derived((current?.description || '').replace(/<[^>]+>/g, '').slice(0, 250));
  
  // Use TMDB banner if available, else AniList banner
  let banner = $derived(
    (banners && current && banners[current.id]) ||
    current?.bannerImage ||
    current?.coverImage?.extraLarge ||
    ''
  );
  
  // Split title: last word gets accent color
  let titleWords = $derived(title.split(' '));
  let titleMain = $derived(titleWords.slice(0, -1).join(' '));
  let titleAccent = $derived(titleWords[titleWords.length - 1]);
</script>

{#if current}
  <div
    class="hero"
    role="region"
    aria-label="Featured anime carousel"
    onmouseenter={() => (paused = true)}
    onmouseleave={() => (paused = false)}
  >
    <!-- Background -->
    <div class="bg-layer">
      {#each anime as a, i (a.id)}
        <div
          class="bg-image"
          style="background-image: url({(banners && banners[a.id]) || a.bannerImage || a.coverImage.extraLarge}); opacity: {i === index ? 1 : 0};"
        ></div>
      {/each}
      <!-- Left-to-right gradient (dark on left for text readability) -->
      <div class="gradient-right"></div>
      <!-- Bottom gradient for smooth transition -->
      <div class="gradient-bottom"></div>
    </div>

    <!-- Top bar: Search + Sign In -->
    <div class="top-bar">
      <div class="search-bar">
        <input type="text" placeholder="Search anime..." aria-label="Search anime" />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </div>
      <button class="sign-in" aria-label="Sign in">
        Sign In
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
      </button>
    </div>

    <!-- Content (left-aligned) -->
    <div class="content">
      <!-- Title with accent word -->
      <h1 class="title">
        {titleMain} <span class="accent">{titleAccent}</span>
      </h1>

      <!-- Metadata pills -->
      <div class="meta">
        {#if current.status === 'RELEASING'}
          <span class="badge-green">RELEASING</span>
        {:else}
          <span class="badge-gray">{current.status}</span>
        {/if}
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
        {#if current.averageScore}
          <span class="meta-item rating">★ {(current.averageScore / 10).toFixed(1)}</span>
        {/if}
      </div>

      <!-- Genres -->
      {#if current.genres?.length}
        <div class="genres">
          {#each current.genres.slice(0, 4) as genre}
            <span class="genre-tag">{genre}</span>
          {/each}
        </div>
      {/if}

      <!-- Synopsis -->
      <p class="synopsis">{description}</p>

      <!-- Buttons -->
      <div class="buttons">
        <button class="btn-primary">
          <Play size={18} fill="currentColor" />
          Watch Now
        </button>
        <button class="btn-secondary" aria-label="More info"><Info size={18} /></button>
        <button class="btn-secondary" aria-label="Add to favorites"><Heart size={18} /></button>
      </div>

      <!-- Carousel indicators -->
      <div class="indicators">
        {#each anime as _, i (i)}
          <button
            class="indicator"
            class:active={i === index}
            onclick={() => (index = i)}
            aria-label="Slide {i + 1}"
          ></button>
        {/each}
      </div>
    </div>

    <!-- Nav arrows -->
    <button class="nav-arrow prev" onclick={prev} aria-label="Previous"><ChevronLeft size={20} /></button>
    <button class="nav-arrow next" onclick={next} aria-label="Next"><ChevronRight size={20} /></button>
  </div>
{/if}

<style>
  .hero {
    position: relative;
    height: 85vh;
    min-height: 550px;
    width: 100%;
    overflow: hidden;
  }

  /* Background layers */
  .bg-layer { position: absolute; inset: 0; }
  .bg-image {
    position: absolute; inset: 0;
    background-size: cover;
    background-position: center 20%;
    transition: opacity 1.2s ease;
  }
  .gradient-right {
    position: absolute; inset: 0;
    background: linear-gradient(to right,
      rgba(10,10,12,0.95) 0%,
      rgba(10,10,12,0.75) 40%,
      rgba(10,10,12,0.4) 70%,
      rgba(10,10,12,0.1) 100%
    );
  }
  .gradient-bottom {
    position: absolute; inset: 0;
    background: linear-gradient(to top, #0a0a0a, transparent 50%);
  }

  /* Top bar */
  .top-bar {
    position: absolute; top: 0; left: 0; right: 0; z-index: 20;
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 32px;
  }
  .search-bar {
    display: flex; align-items: center; gap: 8px;
    background: rgba(30,30,35,0.8); backdrop-filter: blur(12px);
    border-radius: 999px; padding: 12px 20px;
    border: 1px solid rgba(255,255,255,0.15);
    max-width: 450px; width: 100%; margin: 0 auto;
    color: #9ca3af;
  }
  .search-bar input {
    flex: 1; background: transparent; border: none; outline: none;
    color: white; font-size: 14px;
  }
  .search-bar input::placeholder { color: #9ca3af; }
  .sign-in {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 20px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.2);
    background: transparent; color: white; font-size: 14px; font-weight: 500;
    cursor: pointer; transition: all 0.2s;
  }
  .sign-in:hover { background: rgba(255,255,255,0.1); }

  /* Content */
  .content {
    position: absolute; bottom: 0; left: 0; right: 0; z-index: 10;
    padding: 0 32px 48px; max-width: 640px;
  }
  .title {
    font-size: 48px; font-weight: 700; color: white;
    line-height: 1.2; margin: 0 0 16px;
    text-shadow: 0 2px 10px rgba(0,0,0,0.3);
  }
  .accent { color: #3b82f6; }

  /* Metadata */
  .meta {
    display: flex; align-items: center; gap: 16px;
    margin-bottom: 12px; flex-wrap: wrap;
  }
  .badge-green {
    background: #10b981; color: white;
    padding: 4px 10px; border-radius: 6px;
    font-size: 12px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .badge-gray {
    background: rgba(255,255,255,0.15); color: #e5e7eb;
    padding: 4px 10px; border-radius: 6px;
    font-size: 12px; font-weight: 600; text-transform: uppercase;
  }
  .meta-item {
    display: flex; align-items: center; gap: 6px;
    color: #e5e7eb; font-size: 14px;
  }
  .meta-item.rating { color: #fbbf24; font-weight: 600; }

  /* Genres */
  .genres { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .genre-tag {
    padding: 2px 10px; border-radius: 999px;
    background: rgba(255,255,255,0.08); color: #d1d5db;
    font-size: 12px; border: 1px solid rgba(255,255,255,0.06);
  }

  /* Synopsis */
  .synopsis {
    color: #9ca3af; font-size: 15px; line-height: 1.6;
    margin: 0 0 24px; max-width: 600px;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Buttons */
  .buttons { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .btn-primary {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 24px; background: white; color: black;
    font-weight: 600; border-radius: 8px; border: none;
    cursor: pointer; font-size: 14px; transition: all 0.2s;
  }
  .btn-primary:hover { background: #e5e7eb; }
  .btn-secondary {
    width: 44px; height: 44px; border-radius: 8px;
    background: rgba(255,255,255,0.1); backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.1); color: white;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
  }
  .btn-secondary:hover { background: rgba(255,255,255,0.2); }

  /* Indicators */
  .indicators { display: flex; align-items: center; gap: 8px; }
  .indicator {
    height: 3px; border-radius: 999px; border: none;
    background: rgba(255,255,255,0.3); width: 16px; cursor: pointer;
    transition: all 0.3s;
  }
  .indicator.active { background: white; width: 32px; }

  /* Nav arrows */
  .nav-arrow {
    position: absolute; top: 50%; transform: translateY(-50%);
    z-index: 10; width: 40px; height: 40px; border-radius: 999px;
    background: rgba(0,0,0,0.4); backdrop-filter: blur(8px);
    border: none; color: white; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
  }
  .nav-arrow:hover { background: rgba(0,0,0,0.6); }
  .nav-arrow.prev { right: 16px; }
  .nav-arrow.next { right: 56px; }

  /* Responsive */
  @media (max-width: 768px) {
    .title { font-size: 32px; }
    .content { padding: 0 20px 32px; }
    .synopsis { -webkit-line-clamp: 2; }
    .nav-arrow { display: none; }
  }
</style>
