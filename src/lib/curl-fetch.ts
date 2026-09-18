/**
 * Shared curl-based fetch utility.
 *
 * Problem: Node.js fetch() / undici gets Cloudflare bot_detected on VPS IPs
 * (returns HTML challenge page instead of JSON). curl has a different TLS
 * fingerprint that CF doesn't block.
 *
 * Strategy: curl first → Node fetch fallback → optional worker proxy fallback.
 * curl typically resolves in 0.3-0.8s vs Node fetch which gets CF-blocked
 * and takes 3-10s on the double-fetch retry pattern.
 *
 * IMPORTANT: Uses dynamic import("node:child_process") so this file can be
 * imported from client-side code without bundling issues.
 */

/**
 * curl-based fetch that bypasses Cloudflare bot_detection.
 *
 * @param url - The URL to fetch
 * @param options - Request options (method, headers, body)
 * @param timeoutMs - Timeout in milliseconds (default: 6000)
 * @returns Response-like object with ok, status, json(), text()
 */
export async function curlFetch(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {}
): Promise<Response> {
  const { method = "GET", headers = {}, body, timeoutMs = 6000 } = options;

  try {
    const { execFile } = await import("node:child_process");
    const args: string[] = [
      "-s", "--max-time", String(Math.ceil(timeoutMs / 1000)),
      "--compressed", "-L", // follow redirects
    ];
    for (const [k, v] of Object.entries(headers)) {
      args.push("-H", `${k}: ${v}`);
    }
    if (method.toUpperCase() === "POST" && body) {
      args.push("-X", "POST", "-d", body);
    }
    args.push(url);

    const result = await new Promise<string>((resolve, reject) => {
      execFile("curl", args, { timeout: timeoutMs + 2000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });

    // Parse JSON response
    let jsonData: any;
    try { jsonData = JSON.parse(result); } catch { jsonData = null; }

    // Return a Response-like object
    const resp: any = {
      ok: true, status: 200, statusText: "OK",
      headers: new Headers({ "content-type": "application/json" }),
      async json() { return jsonData; },
      async text() { return result; },
    };
    return resp as Response;
  } catch {
    // curl failed — fall back to standard Node fetch
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method,
        headers,
        body: body || undefined,
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);
      return res;
    } catch (e: any) {
      // Both curl and fetch failed
      const errResp: any = {
        ok: false, status: 502, statusText: "Bad Gateway",
        headers: new Headers(),
        _body: JSON.stringify({ error: e?.message || "fetch failed" }),
        async json() { try { return JSON.parse(this._body); } catch { return null; } },
        async text() { return this._body; },
      };
      return errResp as Response;
    }
  }
}

/**
 * Convenience wrapper: GET request with curl.
 * Merges provided headers with common browser headers.
 */
export async function curlGetJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 6000
): Promise<any | null> {
  const res = await curlFetch(url, { headers, timeoutMs });
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

/**
 * Default browser-like headers for anime API requests.
 * These mimic what a browser would send, preventing basic bot detection.
 */
export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
};
