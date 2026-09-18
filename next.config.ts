import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // ── PERFORMANCE: Enable compression + hide powered-by header ──
  compress: true,
  poweredByHeader: false,

  // Don't bundle these Node-only packages — let them resolve at runtime
  serverExternalPackages: ["undici"],

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // ─── Tightened Content Security Policy ───
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "img-src * blob: data: https:",
              "frame-src * blob: data:",
              "frame-ancestors 'self'",  // was ALLOWALL — now only same-origin embeds
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' https: wss: http://169.58.120.196:4002 http://169.58.120.196:4000 http://169.58.120.196:8095 https://api.luffytv.live https://www.google-analytics.com https://region1.google-analytics.com",
              "media-src * blob: data: https: http:",
              "font-src 'self' https://fonts.gstatic.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          // ─── Anti-Clickjacking ───
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",  // was ALLOWALL
          },
          // ─── Prevent MIME type sniffing ───
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // ─── Force HTTPS ───
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // ─── Referrer Policy ───
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // ─── Permissions Policy — lock down browser APIs ───
          {
            key: "Permissions-Policy",
            value: [
              "camera=()",
              "microphone=()",
              "geolocation=()",
              "payment=()",
              "usb=()",
              "magnetometer=()",
              "gyroscope=()",
              "accelerometer=()",
              "ambient-light-sensor=()",
              "battery=()",
              "display-capture=()",
              "document-domain=()",
              "encrypted-media=()",
              "fullscreen=(self)",
              "hid=()",
              "idle-detection=()",
              "local-fonts=()",
              "midi=()",
              "otp-credentials=()",
              "publickey-credentials-get=()",
              "serial=()",
              "speaker-selection=()",
              "sync-xhr=()",
              "unload=()",
              "window-management=()",
            ].join(", "),
          },
          // ─── XSS Protection (legacy but still useful) ───
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          // ─── Cross-Origin policies ───
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
          },
          // ─── Cache control for API routes ───
          {
            key: "X-Powered-By",
            value: "",  // Hide Next.js version
          },
        ],
      },
      // ─── HTML page caching (ISR) ───
      // Cache ALL HTML pages for 30 seconds at the CDN edge.
      // This is what makes the homepage load in ~50ms instead of 1.2s.
      // Next.js App Router catch-all routes are dynamic by default, which
      // sets cache-control: no-store. This overrides that for HTML pages.
      {
        source: "/((?!api|_next/static|_next/image|favicon).*)",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=30, stale-while-revalidate=60" },
        ],
      },
      // ─── API cache control ───
      // Per-route Cache-Control headers (s-maxage, stale-while-revalidate) are set
      // in each API route's NextResponse.json() call. Those headers determine
      // CDN edge caching (Cloudflare s-maxage). We do NOT set a blanket no-store
      // here because it would override all per-route caching.
      //
      // Only truly non-cacheable routes (stream/proxy) get no-store here:
      {
        source: "/api/stream",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/api/hls-proxy",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/api/embed/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
