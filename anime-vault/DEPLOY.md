# AnimeVault — VPS Deployment Guide

## Project name: **AnimeVault**

## VPS Deployment Steps

### 1. Upload to VPS
```bash
# On your local machine:
rsync -avz --exclude node_modules --exclude .svelte-kit --exclude build /home/z/my-project/anime-vault/ user@your-vps:/var/www/anime-vault/

# Or use git:
cd /home/z/my-project/anime-vault
git init && git add -A && git commit -m "AnimeVault — SvelteKit anime site"
git remote add origin https://github.com/yourname/anime-vault.git
git push -u origin main
```

### 2. On the VPS:
```bash
cd /var/www/anime-vault
npm install
npm run build
```

### 3. Start the server:
```bash
# Using PM2 (recommended for production):
npm install -g pm2
pm2 start "node build" --name anime-vault --env production
pm2 save
pm2 startup  # auto-start on reboot

# Or plain node:
PORT=3000 node build

# Or with custom host/port:
HOST=0.0.0.0 PORT=3000 node build
```

### 4. Nginx reverse proxy (recommended):
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5. Environment variables:
```bash
# Optional — set in .env or shell
export PORT=3000          # default 3000
export HOST=0.0.0.0       # default 0.0.0.0
export ORIGIN=https://yourdomain.com  # for CORS/cookies
```

## Tech Stack
- **SvelteKit 2.63** + **Svelte 5.56** (runes mode)
- **@sveltejs/adapter-node** (VPS-ready, runs as Node.js server)
- **TypeScript**
- **lucide-svelte** (icons)
- **AniList GraphQL API** (anime banners, covers, trending)
- **TMDB API** (movie/TV metadata)

## File Structure
```
anime-vault/
├── src/
│   ├── app.css                    # Global styles
│   ├── lib/
│   │   ├── anilist.ts             # AniList API client
│   │   ├── tmdb.ts                # TMDB API client
│   │   └── components/
│   │       ├── Sidebar.svelte     # Left nav rail
│   │       ├── HeroBanner.svelte   # Top carousel
│   │       ├── AnimeCard.svelte   # Poster card
│   │       └── AnimeRow.svelte    # Horizontal scroll row
│   └── routes/
│       ├── +layout.svelte         # Root layout
│       ├── +page.svelte           # Homepage
│       └── +page.ts               # Server load (fetches AniList data)
├── vite.config.ts                 # SvelteKit + adapter-node config
├── package.json
└── build/                         # Production output (after build)
    └── index.js                   # Node.js server entry point
```

## Quick Commands
```bash
npm run dev      # Dev server (localhost:3001)
npm run build    # Production build → ./build/
npm run start    # Start production server (PORT=3000)
```
