import type { NextConfig } from 'next';
const config: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 's4.anilist.co' },
      { protocol: 'https', hostname: 'image.tmdb.org' },
      { protocol: 'https', hostname: 'api.anilist.co' },
    ],
  },
};
export default config;
