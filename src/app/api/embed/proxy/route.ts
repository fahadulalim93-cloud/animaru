import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/embed/proxy?url=<encoded_url>
 *
 * Server-side proxy that fetches embed content, strips sandbox/iframe
 * detection scripts, injects anti-sandbox overrides, and serves it back
 * with headers that allow embedding.
 *
 * This bypasses the "Sandbox Detected" check since the content comes from
 * our own domain and all iframe-busting code is neutralized.
 */

// Anti-sandbox script injected at the very start of <head> — runs BEFORE
// any embed scripts can detect the iframe environment.
const ANTI_SANDBOX_SCRIPT = `<script>
// Anti-sandbox detection override — must run before any other script
try {
  // Override window.self, window.top, window.parent to all equal window
  Object.defineProperty(window, 'self', { get: function() { return window; }, configurable: true });
  Object.defineProperty(window, 'top', { get: function() { return window; }, configurable: true });
  Object.defineProperty(window, 'parent', { get: function() { return window; }, configurable: true });
  Object.defineProperty(window, 'frameElement', { get: function() { return null; }, configurable: true });

  // Override location-based detection
  try {
    var origLocation = window.location;
    Object.defineProperty(window.top, 'location', { get: function() { return origLocation; }, configurable: true });
    Object.defineProperty(window.parent, 'location', { get: function() { return origLocation; }, configurable: true });
  } catch(e) {}

  // Prevent break-out attempts via beforeunload
  window.addEventListener('beforeunload', function(e) { e.stopImmediatePropagation(); return false; }, true);
  window.addEventListener('unload', function(e) { e.stopImmediatePropagation(); }, true);

  // Intercept document.domain setter
  try {
    var _domain = document.domain;
    Object.defineProperty(document, 'domain', {
      get: function() { return _domain; },
      set: function(v) { _domain = v; },
      configurable: true
    });
  } catch(e) {}

  // Catch and neutralize sandbox checks in eval'd code
  var origEval = window.eval;
  window.eval = function(code) {
    if (typeof code === 'string') {
      code = code
        .replace(/sandbox\s*===?\s*true/gi, 'false')
        .replace(/sandbox\s*!==?\s*false/gi, 'false')
        .replace(/window\.self\s*!==?\s*window\.top/gi, 'false')
        .replace(/window\.top\s*!==?\s*window\.self/gi, 'false')
        .replace(/self\s*!==?\s*top/gi, 'false')
        .replace(/top\s*!==?\s*self/gi, 'false')
        .replace(/window\.frameElement/gi, 'null')
        .replace(/parent\s*!==?\s*window/gi, 'false')
        .replace(/window\s*!==?\s*window\.parent/gi, 'false')
        .replace(/window\.parent\s*!==?\s*window/gi, 'false');
    }
    return origEval.call(window, code);
  };

  // Intercept Function constructor to neutralize sandbox checks in dynamically created functions
  var origFunction = window.Function;
  window.Function = function() {
    var args = Array.prototype.slice.call(arguments);
    if (args.length > 0) {
      var last = args[args.length - 1];
      if (typeof last === 'string') {
        last = last
          .replace(/sandbox\s*===?\s*true/gi, 'false')
          .replace(/window\.self\s*!==?\s*window\.top/gi, 'false')
          .replace(/window\.top\s*!==?\s*window\.self/gi, 'false')
          .replace(/self\s*!==?\s*top/gi, 'false')
          .replace(/top\s*!==?\s*self/gi, 'false')
          .replace(/window\.frameElement/gi, 'null')
          .replace(/parent\s*!==?\s*window/gi, 'false')
          .replace(/window\.parent\s*!==?\s*window/gi, 'false');
        args[args.length - 1] = last;
      }
    }
    return origFunction.apply(this, args);
  };
  window.Function.prototype = origFunction.prototype;

  // Block top.location.href assignment attempts
  try {
    var _topLoc = window.location;
    Object.defineProperty(window, 'location', {
      get: function() { return _topLoc; },
      set: function(v) { /* block redirect */ },
      configurable: true
    });
  } catch(e) {}

  // Neutralize postMessage-based sandbox detection
  var origPostMessage = window.postMessage;
  window.postMessage = function(msg, target, transfer) {
    if (typeof msg === 'string' && (msg.includes('sandbox') || msg.includes('iframe') || msg.includes('frame'))) {
      return;
    }
    return origPostMessage.call(window, msg, target, transfer);
  };

  // Intercept MutationObserver to prevent DOM-based sandbox detection
  var origMutationObserver = window.MutationObserver;
  window.MutationObserver = function(callback) {
    var wrappedCallback = function(mutations, observer) {
      try {
        var filtered = mutations.filter(function(m) {
          if (m.addedNodes) {
            for (var i = 0; i < m.addedNodes.length; i++) {
              var node = m.addedNodes[i];
              if (node.nodeType === 1) {
                var tag = (node.tagName || '').toLowerCase();
                if (tag === 'script' || tag === 'style') {
                  var text = node.textContent || node.innerText || '';
                  if (/sandbox|iframe/i.test(text)) return false;
                }
              }
            }
          }
          return true;
        });
        if (filtered.length > 0) callback(filtered, observer);
      } catch(e) {
        callback(mutations, observer);
      }
    };
    return new origMutationObserver(wrappedCallback);
  };
  window.MutationObserver.prototype = origMutationObserver.prototype;

  // Intercept IntersectionObserver to prevent visibility-based detection
  var origIntersectionObserver = window.IntersectionObserver;
  window.IntersectionObserver = function(callback, options) {
    var wrappedCallback = function(entries, observer) {
      try {
        var patched = entries.map(function(entry) {
          return Object.create(entry, {
            isIntersecting: { get: function() { return true; } },
            intersectionRatio: { get: function() { return 1; } }
          });
        });
        callback(patched, observer);
      } catch(e) {
        callback(entries, observer);
      }
    };
    return new origIntersectionObserver(wrappedCallback, options);
  };
  window.IntersectionObserver.prototype = origIntersectionObserver.prototype;

  // Override document.hasFocus() to always return true
  // Some embeds check if the iframe has focus to detect framing
  try {
    Object.defineProperty(document, 'hasFocus', {
      value: function() { return true; },
      writable: true,
      configurable: true
    });
  } catch(e) {}

  // Intercept WebSocket to prevent WebSocket-based sandbox detection
  var origWebSocket = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    var ws = protocols ? new origWebSocket(url, protocols) : new origWebSocket(url);
    var origAddEventListener = ws.addEventListener.bind(ws);
    ws.addEventListener = function(type, listener, options) {
      if (type === 'message') {
        var wrappedListener = function(event) {
          try {
            var data = typeof event.data === 'string' ? event.data : '';
            if (/sandbox|iframe|frame/i.test(data)) return;
          } catch(e) {}
          listener.call(ws, event);
        };
        return origAddEventListener(type, wrappedListener, options);
      }
      return origAddEventListener(type, listener, options);
    };
    return ws;
  };
  window.WebSocket.prototype = origWebSocket.prototype;
  window.WebSocket.CONNECTING = origWebSocket.CONNECTING;
  window.WebSocket.OPEN = origWebSocket.OPEN;
  window.WebSocket.CLOSING = origWebSocket.CLOSING;
  window.WebSocket.CLOSED = origWebSocket.CLOSED;

  // Prevent inline event handler sandbox checks (onload, onerror on body/iframe)
  try {
    var origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      if (typeof name === 'string' && name.toLowerCase().startsWith('on') && typeof value === 'string') {
        if (/sandbox|iframe|self.*top|top.*self|frameElement/i.test(value)) {
          return;
        }
      }
      return origSetAttribute.call(this, name, value);
    };
  } catch(e) {}

} catch(e) {}
</script>`;

// Patterns used to strip entire <script> tags that contain sandbox/iframe detection code
const SCRIPT_STRIP_PATTERNS = [
  // Sandbox detection keywords
  /sandbox/i,
  /frameElement/i,
  /top\.location/i,
  /parent\.location/i,
  /self\s*!==?\s*top/i,
  /top\s*!==?\s*self/i,
  /window\.self\s*!==?\s*window\.top/i,
  /window\.top\s*!==?\s*window\.self/i,
  /window\.parent\s*!==?\s*window/i,
  /window\s*!==?\s*window\.parent/i,
  /parent\s*!==?\s*window/i,
  /window\.frameElement/i,
  /iframe\s*detect/i,
  /iframe\s*check/i,
  /frame\s*bust/i,
  /break[_-]?out/i,
  /escape[_-]?frame/i,
  /X-Frame-Options/i,
  /frame-ancestors/i,
  /isIframe/i,
  /inIframe/i,
  /in_iframe/i,
  /isFramed/i,
  /framedCheck/i,
  /top\s*=\s*self/i,
  /window\.top\s*=\s*window/i,
  /document\.hasFocus/i,
  /MutationObserver.*sandbox/i,
  /IntersectionObserver/i,
  /visibilityState/i,
  /document\.hidden/i,
  /onload.*sandbox/i,
  /onload.*iframe/i,
];

/**
 * Strip <script> tags that match any of the sandbox detection patterns.
 * This removes entire script blocks including their content.
 */
function stripSandboxScripts(html: string): string {
  // Match <script...>...</script> blocks (including multiline content)
  let result = html.replace(
    /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
    (fullMatch, scriptContent) => {
      // Check if the script content matches any sandbox detection pattern
      for (const pattern of SCRIPT_STRIP_PATTERNS) {
        if (pattern.test(scriptContent)) {
          return "<!-- sandbox-script-stripped -->";
        }
      }
      return fullMatch;
    }
  );

  // Also strip inline event handlers that contain sandbox/iframe detection
  // e.g., <body onload="if(self!==top)...">
  result = result.replace(
    /\bon(load|error|readystatechange|beforeunload|unload|focus|blur)\s*=\s*["']([^"']*(?:sandbox|iframe|self.*top|top.*self|frameElement)[^"']*)["']/gi,
    (fullMatch, eventName, handlerContent) => {
      return `on${eventName}="/* stripped-sandbox-handler */"`;
    }
  );

  // Strip inline event handlers without quotes
  result = result.replace(
    /\bon(load|error|readystatechange|beforeunload|unload|focus|blur)\s*=\s*([^">\s]*(?:sandbox|iframe|self.*top|top.*self|frameElement)[^">\s]*)/gi,
    (fullMatch, eventName) => {
      return `on${eventName}="/* stripped-sandbox-handler */"`;
    }
  );

  return result;
}

/**
 * Apply inline regex replacements to neutralize sandbox detection in remaining scripts.
 * These are applied AFTER stripping whole suspicious scripts, so they catch
 * edge cases in scripts that weren't fully stripped.
 */
function neutralizeInlinePatterns(html: string): string {
  let result = html;

  // Replace sandbox detection comparisons
  result = result.replace(/sandbox\s*===?\s*true/gi, "false");
  result = result.replace(/sandbox\s*!==?\s*false/gi, "false");
  result = result.replace(/sandbox\s*===?\s*1/gi, "false");
  result = result.replace(/sandbox\s*!==?\s*0/gi, "false");

  // Replace window.self !== window.top patterns (and variations)
  result = result.replace(/window\.self\s*!==?\s*window\.top/gi, "false");
  result = result.replace(/window\.top\s*!==?\s*window\.self/gi, "false");
  result = result.replace(/self\s*!==?\s*top/gi, "false");
  result = result.replace(/top\s*!==?\s*self/gi, "false");

  // Replace frameElement checks
  result = result.replace(/window\.frameElement/gi, "null");
  result = result.replace(/frameElement\s*!==?\s*null/gi, "false");
  result = result.replace(/null\s*!==?\s*frameElement/gi, "false");

  // Replace parent !== window patterns
  result = result.replace(/parent\s*!==?\s*window/gi, "false");
  result = result.replace(/window\s*!==?\s*window\.parent/gi, "false");
  result = result.replace(/window\.parent\s*!==?\s*window/gi, "false");

  // Replace common iframe-busting redirect patterns
  result = result.replace(
    /if\s*\(\s*window\.self\s*!==?\s*window\.top\s*\)\s*\{[^}]*top\.location\.href\s*=\s*[^}]*\}/gi,
    "/* sandbox-check-removed */"
  );
  result = result.replace(
    /if\s*\(\s*window\.top\s*!==?\s*window\.self\s*\)\s*\{[^}]*top\.location\.href\s*=\s*[^}]*\}/gi,
    "/* sandbox-check-removed */"
  );
  result = result.replace(
    /if\s*\(\s*window\s*!==?\s*window\.parent\s*\)\s*\{[^}]*parent\.location\.href\s*=\s*[^}]*\}/gi,
    "/* sandbox-check-removed */"
  );
  result = result.replace(
    /if\s*\(\s*self\s*!==?\s*top\s*\)\s*\{[^}]*top\.location[^}]*\}/gi,
    "/* sandbox-check-removed */"
  );
  result = result.replace(
    /if\s*\(\s*top\s*!==?\s*self\s*\)\s*\{[^}]*top\.location[^}]*\}/gi,
    "/* sandbox-check-removed */"
  );
  result = result.replace(
    /if\s*\(\s*window\.frameElement\s*\)\s*\{[^}]*parent\.location[^}]*\}/gi,
    "/* sandbox-check-removed */"
  );

  // Neutralize top.location.assign and top.location.replace
  result = result.replace(
    /top\.location\.(assign|replace)\s*\(/gi,
    "/* blocked-redirect */(/* "
  );
  result = result.replace(
    /parent\.location\.(assign|replace)\s*\(/gi,
    "/* blocked-redirect */(/* "
  );

  // Remove X-Frame-Options meta tags
  result = result.replace(
    /<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi,
    ""
  );

  // Remove CSP meta tags with frame-ancestors
  result = result.replace(
    /<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*frame-ancestors[^>]*>/gi,
    ""
  );

  // Neutralize document.domain access in try/catch patterns (common sandbox detection)
  result = result.replace(
    /try\s*\{\s*document\.domain\s*=\s*[^;]+;\s*\}\s*catch\s*\([^)]*\)\s*\{\s*(top|parent)\.location/gi,
    "try { /* domain-removed */ } catch(e) { /* redirect-blocked */"
  );

  // Neutralize document.hidden / visibilityState checks (used by some embeds)
  result = result.replace(/document\.hidden/gi, "false");
  result = result.replace(/document\.visibilityState/gi, "'visible'");
  result = result.replace(/visibilityState\s*===?\s*['"]visible['"]/gi, "true");
  result = result.replace(/visibilityState\s*!==?\s*['"]visible['"]/gi, "false");

  // Neutralize document.hasFocus() calls
  result = result.replace(/document\.hasFocus\(\)/gi, "true");
  result = result.replace(/!document\.hasFocus/gi, "false");
  result = result.replace(/document\.hasFocus\s*===?\s*false/gi, "false");
  result = result.replace(/document\.hasFocus\s*!==?\s*true/gi, "false");

  return result;
}

/**
 * Inject the anti-sandbox script at the very start of <head>,
 * or if no <head> tag, at the very start of the document.
 */
function injectAntiSandboxScript(html: string): string {
  // Try to inject right after <head> or <head ...>
  const headMatch = html.match(/<head\b[^>]*>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertPos = headMatch.index + headMatch[0].length;
    return html.slice(0, insertPos) + ANTI_SANDBOX_SCRIPT + html.slice(insertPos);
  }

  // Try to inject before the first <script> tag
  const scriptMatch = html.match(/<script\b/i);
  if (scriptMatch && scriptMatch.index !== undefined) {
    return html.slice(0, scriptMatch.index) + ANTI_SANDBOX_SCRIPT + html.slice(scriptMatch.index);
  }

  // Try to inject right after <html> or <!DOCTYPE html>
  const htmlMatch = html.match(/<html\b[^>]*>/i);
  if (htmlMatch && htmlMatch.index !== undefined) {
    const insertPos = htmlMatch.index + htmlMatch[0].length;
    return html.slice(0, insertPos) + ANTI_SANDBOX_SCRIPT + html.slice(insertPos);
  }

  // Last resort: prepend
  return ANTI_SANDBOX_SCRIPT + html;
}

/**
 * Fetch with timeout and retry logic
 */
async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "identity",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeout);

      if (res.ok) return res;

      // Retry on server errors or rate limits
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      return res;
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  // Validate URL format
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) {
      return NextResponse.json({ error: "Only http(s) URLs allowed" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const res = await fetchWithRetry(url);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: 502 }
      );
    }

    let html = await res.text();

    // Step 1: Strip entire <script> tags that contain sandbox detection patterns
    html = stripSandboxScripts(html);

    // Step 2: Neutralize inline patterns in remaining scripts
    html = neutralizeInlinePatterns(html);

    // Step 3: Inject anti-sandbox override script at the very start of <head>
    html = injectAntiSandboxScript(html);

    // Step 4: Rewrite relative URLs to absolute so resources load correctly
    const baseUrl = new URL(url).origin;
    html = html.replace(
      /((?:src|href)\s*=\s*["'])(\/[^"']*)/gi,
      `$1${baseUrl}$2`
    );

    // Step 5: Inject CSS to force the embed to fill the iframe container
    const FILL_CSS = `<style>
html, body { width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #000 !important; }
video { width: 100% !important; height: 100% !important; object-fit: contain !important; }
iframe { width: 100% !important; height: 100% !important; border: none !important; }
#player, .player, [id*="player"], [class*="player"] { width: 100% !important; height: 100% !important; }
</style>`;
    // Inject CSS right after <head> or at the start
    if (html.includes('<head>')) {
      html = html.replace('<head>', '<head>' + FILL_CSS);
    } else if (html.includes('<head ')) {
      html = html.replace(/<head /, '<head ' + FILL_CSS + ' ');
    } else {
      html = FILL_CSS + html;
    }

    // Step 6: Remove Content-Security-Policy headers that might block framing
    // (We set our own permissive CSP in the response)

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Frame-Options": "ALLOWALL",
        "Content-Security-Policy":
          "frame-ancestors *; default-src * 'unsafe-inline' 'unsafe-eval' data: blob: http: https:; script-src * 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; media-src * data: blob:; connect-src * http: https: ws: wss:; style-src * 'unsafe-inline';",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err: any) {
    console.error("[embed-proxy] Error:", err?.message || err);
    return NextResponse.json(
      { error: "Failed to fetch embed content", details: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
