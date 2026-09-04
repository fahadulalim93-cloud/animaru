"use client";

import { useEffect, useCallback, useRef } from "react";

/**
 * Client-Side Anti-Scrape Protection Component
 *
 * What it does:
 * 1. Decrypts encrypted API responses transparently (intercepts fetch)
 * 2. Attaches signed request tokens to every API call
 * 3. Detects DevTools opening (adds noise / warnings)
 * 4. Disables right-click "Inspect" context menu on production
 * 5. Blocks keyboard shortcuts for DevTools (F12, Ctrl+Shift+I, etc.)
 * 6. Adds request fingerprinting
 * 7. Detects headless browser environment
 */

// ─── Encryption Key Sync ───
// The server rotates the encryption key every 5 minutes.
// We fetch the current key bucket from a response header and
// derive the key client-side using the same algorithm.

let currentToken = "";

function simpleHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = 4294967296 * (h2 >>> 0) + (h1 >>> 0);
  return combined.toString(16).padStart(16, "0") + combined.toString(16).padStart(16, "0");
}

function getEncKey(bucket: number): string {
  const secret = process.env.NEXT_PUBLIC_XOR_KEY || "default-anti-scrape-key-change-me";
  return simpleHash(bucket.toString() + secret);
}

function decryptData(encrypted: string, bucket: number): string {
  const key = getEncKey(bucket);
  // Decode base64
  const binary = atob(encrypted);
  const keyChars = Array.from(key);
  let result = "";
  for (let i = 0; i < binary.length; i++) {
    const charCode = binary.charCodeAt(i) ^ keyChars[i % keyChars.length].charCodeAt(0);
    result += String.fromCharCode(charCode);
  }
  return result;
}

// ─── Fetch Interceptor ───
// Monkey-patch global fetch to:
// 1. Add signed token header to every request
// 2. Auto-decrypt encrypted responses

const originalFetch = typeof window !== "undefined" ? window.fetch : null;

function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  // Only intercept our own API calls
  if (url.startsWith("/api/") || url.includes("/api/")) {
    const headers = new Headers(init?.headers || {});

    // Attach the signed token
    if (currentToken) {
      headers.set("x-luffy-token", currentToken);
    }

    const newInit: RequestInit = {
      ...init,
      headers,
    };

    return (originalFetch || fetch)(input, newInit).then(async (response) => {
      // Capture fresh token from response
      const newToken = response.headers.get("x-luffy-token");
      if (newToken) {
        currentToken = newToken;
      }

      // Clone so we can read the body without consuming it
      const clone = response.clone();

      try {
        const json = await clone.json();
        // Check if response is encrypted
        if (json._e === 1 && json._d && json._b !== undefined) {
          const decrypted = decryptData(json._d, json._b);
          const realData = JSON.parse(decrypted);
          // Return a new Response with the decrypted data
          return new Response(JSON.stringify(realData), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }
      } catch {
        // Not JSON or not encrypted — return as-is
      }

      return response;
    });
  }

  return (originalFetch || fetch)(input, init);
}

// ─── DevTools Detection ───

function detectDevTools(): boolean {
  // Method 1: Window size difference (outer vs inner)
  const threshold = 160;
  if (
    window.outerWidth - window.innerWidth > threshold ||
    window.outerHeight - window.innerHeight > threshold
  ) {
    return true;
  }

  // Method 2: Check for debugger statement timing
  // (This is subtle — doesn't actually break anything)

  return false;
}

// ─── Headless Browser Detection ───

function isHeadlessEnvironment(): boolean {
  const checks: string[] = [];

  if (typeof navigator === "undefined") return true;

  // PhantomJS
  if ((navigator as unknown as Record<string, unknown>).phantom) checks.push("phantom");

  // Headless Chrome
  if (navigator.webdriver) checks.push("webdriver");

  // Missing plugins (headless Chrome has 0 plugins)
  if (navigator.plugins.length === 0) checks.push("no-plugins");

  // Missing languages
  if (!navigator.languages || navigator.languages.length === 0) checks.push("no-languages");

  // CDP
  if ((window as unknown as Record<string, unknown>).chrome?.runtime?.id) checks.push("cdp");

  return checks.length >= 2; // Need 2+ signals to flag
}

export default function AntiScrapeClient() {
  const devToolsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    // Block right-click on production
    if (process.env.NODE_ENV === "production") {
      e.preventDefault();
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (process.env.NODE_ENV !== "production") return;

    // Block DevTools shortcuts
    const blocked = [
      e.key === "F12", // DevTools
      e.key === "I" && e.ctrlKey && e.shiftKey, // Ctrl+Shift+I
      e.key === "J" && e.ctrlKey && e.shiftKey, // Ctrl+Shift+J
      e.key === "C" && e.ctrlKey && e.shiftKey, // Ctrl+Shift+C
      e.key === "U" && e.ctrlKey, // Ctrl+U (view source)
      e.key === "S" && e.ctrlKey, // Ctrl+S (save page)
    ];

    if (blocked.some(Boolean)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  useEffect(() => {
    // ─── Install fetch interceptor ───
    if (originalFetch && typeof window !== "undefined") {
      window.fetch = patchedFetch as typeof fetch;
    }

    // ─── Check for headless browser ───
    // IMPORTANT: Don't flag SEO crawlers (Googlebot, Bingbot) as headless.
    // They use headless Chromium but need full content for indexing.
    // Googlebot uses a two-phase crawl: first HTTP fetch with "Googlebot" UA,
    // then JS rendering with a Chrome-like UA. We must not block either phase.
    const userAgent = navigator.userAgent?.toLowerCase() || "";
    const isSeoBot = userAgent.includes("googlebot") || userAgent.includes("bingbot") ||
      userAgent.includes("yandexbot") || userAgent.includes("baiduspider") ||
      userAgent.includes("slurp") || userAgent.includes("duckduckbot") ||
      userAgent.includes("facebot") || userAgent.includes("twitterbot") ||
      userAgent.includes("linkedinbot");

    // Also check if we're being rendered by Google's Web Rendering Service
    // Googlebot-WR sends specific headers; in the JS context, check for
    // known Google rendering signals.
    const isGoogleRenderer = typeof document !== "undefined" &&
      (document.referrer?.includes("google") || false);

    if (isHeadlessEnvironment() && !isSeoBot && !isGoogleRenderer) {
      // Add noise — serve degraded content to headless browsers
      document.documentElement.classList.add("headless-detected");
      // Optionally redirect or show a challenge
      // For now, just add a flag that pages can check
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("_hd", "1");
      }
    }

    // ─── Block right-click ───
    document.addEventListener("contextmenu", handleContextMenu);

    // ─── Block DevTools shortcuts ───
    document.addEventListener("keydown", handleKeyDown);

    // ─── DevTools detection timer ───
    devToolsTimerRef.current = setInterval(() => {
      if (detectDevTools()) {
        // DevTools is open — add visual noise / watermark
        document.documentElement.classList.add("devtools-open");
      } else {
        document.documentElement.classList.remove("devtools-open");
      }
    }, 1000);

    // ─── Console protection ───
    if (process.env.NODE_ENV === "production") {
      // Override console methods with noise
      const noop = () => {};
      const fakeLog = (...args: unknown[]) => {
        // Only log errors, suppress everything else
        if (args[0] === "error") {
          console.error(...args);
        }
      };
      // Don't fully disable — that's detectable. Just make it noisy.
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        // Mix in random noise every few calls
        if (Math.random() < 0.1) {
          origLog.call(console, `%c${Date.now()}`, "color:transparent;");
        }
        // Don't actually output real data
      };
      console.debug = noop as typeof console.debug;
      console.info = noop as typeof console.info;
      console.table = noop as typeof console.table;
      console.trace = noop as typeof console.trace;
      // Keep console.error and console.warn for real errors
    }

    // ─── REMOVED: QSA override ───
    // Previously, document.querySelectorAll was overridden to return empty
    // results after 100 calls. This BROKE Googlebot's JS rendering because
    // React itself calls QSA hundreds of times during rendering. Google saw
    // blank pages → didn't index.
    //
    // The anti-scrape middleware (server-side) handles real scrapers.
    // Client-side QSA override hurts SEO more than it helps anti-scrape.

    return () => {
      // Cleanup
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      if (devToolsTimerRef.current) {
        clearInterval(devToolsTimerRef.current);
      }
      // Restore original fetch
      if (originalFetch && typeof window !== "undefined") {
        window.fetch = originalFetch;
      }
    };
  }, [handleContextMenu, handleKeyDown]);

  // This component renders nothing
  return null;
}
