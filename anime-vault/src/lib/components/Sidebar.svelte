<script lang="ts">
  import { page } from '$app/state';
  import Home from 'lucide-svelte/icons/home';
  import Search from 'lucide-svelte/icons/search';
  import Calendar from 'lucide-svelte/icons/calendar';
  import User from 'lucide-svelte/icons/user';
  import Download from 'lucide-svelte/icons/download';
  import Music from 'lucide-svelte/icons/music';
  import Heart from 'lucide-svelte/icons/heart';
  import Settings from 'lucide-svelte/icons/settings';
  import LogOut from 'lucide-svelte/icons/log-out';

  const navItems = [
    { icon: Home, label: 'Home', href: '/' },
    { icon: Search, label: 'Search', href: '/search' },
    { icon: Calendar, label: 'Schedule', href: '/schedule' },
    { icon: User, label: 'Profile', href: '/profile' },
    { icon: Download, label: 'Downloads', href: '/downloads' },
    { icon: Music, label: 'Music', href: '/music' },
  ];

  const bottomItems = [
    { icon: Heart, label: 'Favorites', href: '/favorites', color: 'text-red-500' },
    { icon: Settings, label: 'Settings', href: '/settings' },
    { icon: LogOut, label: 'Exit', href: '/logout' },
  ];

  let currentPath = $derived(page.url.pathname);
</script>

<aside class="sidebar">
  <div class="logo">
    <svg viewBox="0 0 32 32" width="28" height="28" fill="white">
      <path d="M16 2L4 8v8c0 6 5 11 12 14 7-3 12-8 12-14V8L16 2z" opacity="0.9"/>
      <path d="M16 6L8 10v6c0 4 3 8 8 10 5-2 8-6 8-10v-6L16 6z" fill="#0a0a0a"/>
      <path d="M16 9l-5 3v4c0 3 2 5 5 7 3-2 5-4 5-7v-4l-5-3z" fill="white"/>
    </svg>
  </div>

  <nav class="nav">
    {#each navItems as item}
      <a href={item.href} class="nav-item" class:active={currentPath === item.href} title={item.label}>
        <item.icon size={20} strokeWidth={1.5} />
      </a>
    {/each}
  </nav>

  <div class="bottom">
    {#each bottomItems as item}
      <a href={item.href} class="nav-item {item.color}" title={item.label}>
        <item.icon size={20} strokeWidth={1.5} />
      </a>
    {/each}
  </div>
</aside>

<style>
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    height: 100vh;
    width: 72px;
    background: #0a0a0a;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 0;
    z-index: 50;
    border-right: 1px solid rgba(255,255,255,0.05);
  }
  .logo { margin-bottom: 24px; display: flex; align-items: center; justify-content: center; }
  .nav { display: flex; flex-direction: column; gap: 8px; flex: 1; }
  .nav-item {
    width: 40px; height: 40px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,0.5); transition: all 0.2s ease;
    cursor: pointer; text-decoration: none;
  }
  .nav-item:hover { background: rgba(255,255,255,0.05); color: white; }
  .nav-item.active { background: rgba(255,255,255,0.1); color: white; }
  .bottom { display: flex; flex-direction: column; gap: 8px; }
</style>
