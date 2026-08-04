import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],

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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' https: wss: https://luffytv-proxy.ggy892767.workers.dev https://luffytv-subtitle.ggy892767.workers.dev",
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
      // ─── Stricter cache control for API routes ───
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
