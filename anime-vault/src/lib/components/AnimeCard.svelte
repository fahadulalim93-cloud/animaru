<script lang="ts">
  import Star from 'lucide-svelte/icons/star';
  import type { AnimeMedia } from '$lib/anilist';

  let { anime }: { anime: AnimeMedia } = $props();

  let title = $derived(anime.title.english || anime.title.romaji || anime.title.userPreferred);
  let cover = $derived(anime.coverImage.extraLarge || anime.coverImage.large);
  let score = $derived(anime.averageScore ? (anime.averageScore / 10).toFixed(1) : null);
</script>

<a href="/anime/{anime.id}" class="card">
  <div class="poster">
    <img src={cover} alt={title} loading="lazy" />
    {#if score}
      <div class="score">
        <Star size={10} fill="currentColor" />
        {score}
      </div>
    {/if}
    <div class="overlay">
      <div class="play-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  </div>
  <div class="info">
    <h3 class="title">{title}</h3>
    <p class="meta">{anime.seasonYear} • {anime.episodes ? `${anime.episodes} eps` : anime.format}</p>
  </div>
</a>

<style>
  .card { width: 160px; text-decoration: none; display: block; }
  .poster {
    position: relative; aspect-ratio: 2/3; border-radius: 10px;
    overflow: hidden; background: rgba(255,255,255,0.05);
    transition: all 0.2s ease;
  }
  .card:hover .poster { transform: scale(1.03); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .score {
    position: absolute; top: 8px; right: 8px;
    padding: 2px 8px; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
    border-radius: 6px; font-size: 12px; font-weight: 700;
    color: #fbbf24; display: flex; align-items: center; gap: 4px;
  }
  .overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.8), transparent 60%);
    opacity: 0; transition: opacity 0.2s;
    display: flex; align-items: center; justify-content: center;
  }
  .card:hover .overlay { opacity: 1; }
  .play-btn {
    width: 48px; height: 48px; border-radius: 999px;
    background: rgba(255,255,255,0.2); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
  }
  .info { margin-top: 8px; }
  .title {
    font-size: 14px; font-weight: 500; color: white;
    margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: color 0.2s;
  }
  .card:hover .title { color: #3b82f6; }
  .meta { font-size: 12px; color: #6b7280; margin: 2px 0 0; }
</style>
