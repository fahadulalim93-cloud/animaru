import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // ─── SEO Headers ──────────────────────────────────────────────
  // Security headers + SEO-friendly caching
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // HSTS — force HTTPS (critical for SEO: no http→https dilution)
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          // X-Content-Type-Options — security
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // X-Frame-Options — prevent clickjacking
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // Referrer-Policy — control referrer data
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Permissions-Policy — limit browser features
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      // Cache static assets aggressively
      {
        source: "/(.*)\\.(ico|png|jpg|jpeg|gif|svg|woff2|woff|ttf|css|js)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Cache sitemap & robots for 1 hour
      {
        source: "/(sitemap.xml|robots.txt)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=3600",
          },
        ],
      },
    ];
  },

  // ─── Redirects ────────────────────────────────────────────────
  // Ensure clean URLs and trailing slash consistency
  async redirects() {
    return [
      // Redirect old/common paths to canonical locations
      {
        source: "/home",
        destination: "/",
        permanent: true,
      },
      {
        source: "/popular",
        destination: "/trending",
        permanent: true,
      },
      {
        source: "/new",
        destination: "/trending",
        permanent: true,
      },
      {
        source: "/anime-list",
        destination: "/library",
        permanent: true,
      },
      {
        source: "/browse",
        destination: "/library",
        permanent: true,
      },
      // Ensure trailing slash consistency (remove trailing slashes)
      {
        source: "/:path*/",
        destination: "/:path",
        permanent: true,
        has: [
          {
            type: "host",
            value: "luffytv.live",
          },
        ],
      },
    ];
  },

  // ─── Rewrites ────────────────────────────────────────────────
  // Clean URLs for watch pages
  async rewrites() {
    return [];
  },

  // ─── Image Optimization ──────────────────────────────────────
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.example.com",
      },
      {
        protocol: "https",
        hostname: "img.luffytv.live",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
