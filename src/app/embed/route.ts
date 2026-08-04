import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const type = searchParams.get("type") || "mp4";
  const title = searchParams.get("title") || "Luffy TV Player";
  const referer = searchParams.get("referer") || "";

  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  // Determine video type
  const isHls = type === "hls" || url.includes(".m3u8");
  const isCdnProxy = url.includes("cdn-eu.1ani.me");
  const isOurProxy = url.includes("/api/stream");
  const PROXY_BASE = process.env.NEXT_PUBLIC_PROXY_BASE || "https://luffytv-proxy.ggy892767.workers.dev";

  // Build the video source URL
  let videoSrc: string;
  if (isCdnProxy || isOurProxy) {
    videoSrc = url;
  } else if (url.startsWith("http")) {
    // External URL — route through Cloudflare Worker if available
    // (Worker handles Referer/Origin/CORS automatically)
    if (PROXY_BASE) {
      videoSrc = isHls
        ? `${PROXY_BASE}/proxy/m3u8?url=${encodeURIComponent(url)}`
        : `${PROXY_BASE}/proxy/raw?url=${encodeURIComponent(url)}`;
    } else {
      videoSrc = url;
    }
  } else {
    videoSrc = `/api/stream?url=${encodeURIComponent(url)}${referer ? `&referer=${encodeURIComponent(referer)}` : ""}`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer-when-downgrade">
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; font-family: system-ui, -apple-system, sans-serif; }
    video { width: 100%; height: 100%; object-fit: contain; }

    .loading {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      color: #E63946; font-size: 14px; text-align: center;
    }
    .loading .spinner {
      width: 40px; height: 40px; border: 3px solid #333; border-top-color: #E63946;
      border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 10px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .error {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      color: #ef4444; font-size: 13px; text-align: center; padding: 20px; max-width: 80%;
    }
    .error .retry-btn {
      display: inline-block; margin-top: 10px; padding: 8px 16px;
      background: #E63946; color: white; border: none; border-radius: 8px;
      cursor: pointer; font-size: 12px;
    }
    .error .retry-btn:hover { background: #D32F3F; }

    .controls-overlay {
      position: absolute; bottom: 0; left: 0; right: 0;
      background: linear-gradient(transparent, rgba(0,0,0,0.85));
      padding: 40px 16px 12px; opacity: 0;
      transition: opacity 0.3s ease; pointer-events: none;
    }
    .controls-overlay.visible { opacity: 1; pointer-events: auto; }

    .progress-container {
      width: 100%; height: 4px; background: rgba(255,255,255,0.2);
      border-radius: 2px; cursor: pointer; margin-bottom: 10px;
      transition: height 0.15s ease;
    }
    .progress-container:hover { height: 8px; }
    .progress-bar {
      height: 100%; background: #E63946; border-radius: 2px; width: 0%;
      pointer-events: none; position: relative;
    }
    .progress-buffer {
      position: absolute; top: 0; left: 0; height: 100%;
      background: rgba(139,92,246,0.3); border-radius: 2px; width: 0%;
    }

    .btn-row { display: flex; align-items: center; gap: 8px; }
    .btn {
      background: none; border: none; color: rgba(255,255,255,0.85);
      cursor: pointer; font-size: 13px; padding: 4px 8px; border-radius: 4px;
      display: flex; align-items: center; gap: 4px;
    }
    .btn:hover { color: white; background: rgba(255,255,255,0.1); }
    .time-display { color: rgba(255,255,255,0.6); font-size: 11px; font-family: monospace; }
    .quality-select {
      background: rgba(0,0,0,0.6); color: white; border: 1px solid rgba(255,255,255,0.2);
      padding: 2px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;
      margin-left: auto;
    }

    .center-play {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 64px; height: 64px; background: rgba(139,92,246,0.9); border-radius: 50%;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
      transition: transform 0.2s, background 0.2s; border: none; color: white;
    }
    .center-play:hover { transform: translate(-50%, -50%) scale(1.1); background: rgba(139,92,246,1); }
    .center-play svg { margin-left: 4px; }

    .seek-indicator {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.7); color: white; padding: 8px 16px;
      border-radius: 8px; font-size: 14px; opacity: 0;
      transition: opacity 0.2s; pointer-events: none;
    }
    .seek-indicator.show { opacity: 1; }

    .volume-group { display: flex; align-items: center; gap: 4px; }
    .volume-slider {
      width: 60px; height: 3px; -webkit-appearance: none; appearance: none;
      background: rgba(255,255,255,0.3); border-radius: 2px; outline: none;
    }
    .volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none; width: 12px; height: 12px;
      border-radius: 50%; background: #E63946; cursor: pointer;
    }

    .speed-indicator {
      color: rgba(255,255,255,0.5); font-size: 11px; font-family: monospace;
      cursor: pointer; padding: 2px 6px; border-radius: 4px;
    }
    .speed-indicator:hover { color: white; background: rgba(255,255,255,0.1); }

    .unmute-overlay {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.85); color: white; padding: 20px 40px;
      border-radius: 16px; font-size: 18px; cursor: pointer; z-index: 100;
      backdrop-filter: blur(12px); border: 2px solid rgba(139,92,246,0.5);
      display: flex; align-items: center; gap: 12px;
      animation: fadeIn 0.3s ease;
    }
    .unmute-overlay:hover { border-color: rgba(139,92,246,0.8); background: rgba(0,0,0,0.9); }
    @keyframes fadeIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
    @keyframes pulse-border { 0%, 100% { border-color: rgba(139,92,246,0.5); } 50% { border-color: rgba(139,92,246,0.9); } }
    .unmute-overlay.pulse { animation: pulse-border 2s ease-in-out infinite; }
  </style>
</head>
<body>
  <div id="loading" class="loading">
    <div class="spinner"></div>
    <div>Loading stream...</div>
  </div>
  <div id="error" class="error" style="display:none"></div>
  <video id="player" playsinline preload="auto" style="display:none"></video>
  <button id="centerPlay" class="center-play" style="display:none">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
  </button>
  <div id="seekIndicator" class="seek-indicator"></div>
  <div id="controlsOverlay" class="controls-overlay">
    <div id="progressContainer" class="progress-container">
      <div id="progressBar" class="progress-bar">
        <div id="progressBuffer" class="progress-buffer"></div>
      </div>
    </div>
    <div class="btn-row">
      <button id="playBtn" class="btn">&#9654;</button>
      <button id="rwBtn" class="btn">-10s</button>
      <button id="ffBtn" class="btn">+10s</button>
      <div class="volume-group">
        <button id="muteBtn" class="btn">&#128264;</button>
        <input id="volumeSlider" type="range" min="0" max="1" step="0.05" value="1" class="volume-slider">
      </div>
      <span id="timeDisplay" class="time-display">0:00 / 0:00</span>
      <span id="speedBtn" class="speed-indicator">1x</span>
      <select id="qualitySelect" class="quality-select" style="display:none"></select>
      <button id="pipBtn" class="btn" style="display:none">PiP</button>
      <button id="fsBtn" class="btn">&#9974;</button>
    </div>
  </div>

  <script>
    (function() {
      var videoUrl = ${JSON.stringify(videoSrc)};
      var videoType = ${JSON.stringify(isHls ? "hls" : type)};
      var isCdnProxy = ${JSON.stringify(isCdnProxy)};
      var isOurProxy = ${JSON.stringify(isOurProxy)};
      var player = document.getElementById('player');
      var loading = document.getElementById('loading');
      var errorEl = document.getElementById('error');
      var centerPlay = document.getElementById('centerPlay');
      var controlsOverlay = document.getElementById('controlsOverlay');
      var progressContainer = document.getElementById('progressContainer');
      var progressBar = document.getElementById('progressBar');
      var progressBuffer = document.getElementById('progressBuffer');
      var playBtn = document.getElementById('playBtn');
      var rwBtn = document.getElementById('rwBtn');
      var ffBtn = document.getElementById('ffBtn');
      var muteBtn = document.getElementById('muteBtn');
      var volumeSlider = document.getElementById('volumeSlider');
      var timeDisplay = document.getElementById('timeDisplay');
      var speedBtn = document.getElementById('speedBtn');
      var qualitySelect = document.getElementById('qualitySelect');
      var pipBtn = document.getElementById('pipBtn');
      var fsBtn = document.getElementById('fsBtn');
      var seekIndicator = document.getElementById('seekIndicator');

      var hlsInstance = null;
      var isPlaying = false;
      var controlsTimer = null;
      var lastTap = 0;
      var playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
      var currentSpeedIdx = 2;
      var retryCount = 0;
      var maxRetries = 3;

      function formatTime(s) {
        if (!s || isNaN(s)) return '0:00';
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        var sec = Math.floor(s % 60);
        if (h > 0) return h + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
        return m + ':' + String(sec).padStart(2,'0');
      }

      function showError(msg) {
        loading.style.display = 'none';
        player.style.display = 'none';
        centerPlay.style.display = 'none';
        controlsOverlay.className = 'controls-overlay';
        errorEl.innerHTML = msg + '<br><button class="retry-btn" onclick="location.reload()">Retry</button>';
        errorEl.style.display = 'block';
      }

      function showPlayer() {
        loading.style.display = 'none';
        player.style.display = 'block';
      }

      function togglePlay() {
        if (player.paused) player.play().catch(function(){});
        else player.pause();
      }

      function showControls() {
        controlsOverlay.className = 'controls-overlay visible';
        clearTimeout(controlsTimer);
        if (isPlaying) {
          controlsTimer = setTimeout(function() {
            controlsOverlay.className = 'controls-overlay';
          }, 3000);
        }
      }

      function showSeek(msg) {
        seekIndicator.textContent = msg;
        seekIndicator.className = 'seek-indicator show';
        setTimeout(function() { seekIndicator.className = 'seek-indicator'; }, 800);
      }

      // Events
      player.addEventListener('play', function() {
        isPlaying = true;
        playBtn.innerHTML = '&#9646;&#9646;';
        centerPlay.style.display = 'none';
        showControls();
      });
      player.addEventListener('pause', function() {
        isPlaying = false;
        playBtn.innerHTML = '&#9654;';
        centerPlay.style.display = 'flex';
        showControls();
      });
      player.addEventListener('timeupdate', function() {
        if (player.duration) {
          progressBar.style.width = (player.currentTime / player.duration * 100) + '%';
          timeDisplay.textContent = formatTime(player.currentTime) + ' / ' + formatTime(player.duration);
        }
      });
      player.addEventListener('progress', function() {
        if (player.buffered.length > 0 && player.duration) {
          var end = player.buffered.end(player.buffered.length - 1);
          progressBuffer.style.width = (end / player.duration * 100) + '%';
        }
      });
      player.addEventListener('ended', function() {
        isPlaying = false;
        playBtn.innerHTML = '&#9654;';
        centerPlay.style.display = 'flex';
        showControls();
      });

      player.addEventListener('click', function() {
        // If muted, unmute first then play
        if (player.muted) {
          player.muted = false;
          player.volume = 1;
          muteBtn.innerHTML = '&#128264;';
          volumeSlider.value = 1;
          // Remove any unmute overlay
          var overlay = document.querySelector('.unmute-overlay');
          if (overlay) overlay.remove();
        }
        togglePlay();
      });
      centerPlay.addEventListener('click', function() {
        if (player.muted) {
          player.muted = false;
          player.volume = 1;
          muteBtn.innerHTML = '&#128264;';
          volumeSlider.value = 1;
          var overlay = document.querySelector('.unmute-overlay');
          if (overlay) overlay.remove();
        }
        togglePlay();
      });
      playBtn.addEventListener('click', togglePlay);

      rwBtn.addEventListener('click', function() {
        player.currentTime = Math.max(0, player.currentTime - 10);
        showSeek('-10s');
      });
      ffBtn.addEventListener('click', function() {
        player.currentTime = Math.min(player.duration || 0, player.currentTime + 10);
        showSeek('+10s');
      });
      progressContainer.addEventListener('click', function(e) {
        var rect = progressContainer.getBoundingClientRect();
        var pct = (e.clientX - rect.left) / rect.width;
        if (player.duration) player.currentTime = pct * player.duration;
      });

      muteBtn.addEventListener('click', function() {
        player.muted = !player.muted;
        muteBtn.innerHTML = player.muted ? '&#128263;' : '&#128264;';
        volumeSlider.value = player.muted ? 0 : player.volume;
      });
      volumeSlider.addEventListener('input', function() {
        player.volume = parseFloat(this.value);
        player.muted = false;
        muteBtn.innerHTML = '&#128264;';
      });

      fsBtn.addEventListener('click', function() {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(function(){});
      });

      if (document.pictureInPictureEnabled) {
        pipBtn.style.display = 'inline-flex';
        pipBtn.addEventListener('click', function() {
          if (document.pictureInPictureElement) document.exitPictureInPicture();
          else player.requestPictureInPicture().catch(function(){});
        });
      }

      speedBtn.addEventListener('click', function() {
        currentSpeedIdx = (currentSpeedIdx + 1) % playbackSpeeds.length;
        var speed = playbackSpeeds[currentSpeedIdx];
        player.playbackRate = speed;
        speedBtn.textContent = speed + 'x';
      });

      document.addEventListener('mousemove', showControls);
      document.addEventListener('touchstart', function() { showControls(); });

      document.addEventListener('touchend', function(e) {
        var now = Date.now();
        if (now - lastTap < 300) {
          var x = e.changedTouches[0].clientX;
          var w = window.innerWidth;
          if (x < w / 3) {
            player.currentTime = Math.max(0, player.currentTime - 10);
            showSeek('-10s');
          } else if (x > w * 2 / 3) {
            player.currentTime = Math.min(player.duration || 0, player.currentTime + 10);
            showSeek('+10s');
          }
        }
        lastTap = now;
      });

      document.addEventListener('keydown', function(e) {
        switch(e.key) {
          case ' ':
          case 'k': e.preventDefault(); togglePlay(); break;
          case 'ArrowLeft': player.currentTime = Math.max(0, player.currentTime - 5); showSeek('-5s'); break;
          case 'ArrowRight': player.currentTime = Math.min(player.duration || 0, player.currentTime + 5); showSeek('+5s'); break;
          case 'ArrowUp': e.preventDefault(); player.volume = Math.min(1, player.volume + 0.1); volumeSlider.value = player.volume; break;
          case 'ArrowDown': e.preventDefault(); player.volume = Math.max(0, player.volume - 0.1); volumeSlider.value = player.volume; break;
          case 'f': fsBtn.click(); break;
          case 'm': muteBtn.click(); break;
          case 'p': if (document.pictureInPictureEnabled) pipBtn.click(); break;
        }
      });

      // ===== Load Video =====
      function loadVideo() {
        if (videoType === 'hls' || videoUrl.includes('.m3u8')) {
          // Load HLS.js dynamically
          var script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.16/dist/hls.min.js';
          script.onload = function() {
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
              hlsInstance = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                xhrSetup: function(xhr, url) {
                  // All proxied URLs already handle CORS and headers
                  // Do not set custom Referer header - it causes CORS issues
                  // that silently break audio segments
                  xhr.withCredentials = false;
                }
              });

              // MSE codec patch: only patch if the browser reports codec error
              // (patching mp4a.40.1 -> mp4a.40.2 unconditionally can break audio)
              hlsInstance.on(Hls.Events.ERROR, function(event, data) {
                if (data.details === 'AUDIO_CODEC_UNSUPPORTED' || data.details === 'CODEC_UNSUPPORTED') {
                  // Try to recover with codec patch on next init segment
                  hlsInstance.off(Hls.Events.FRAG_PARSING_INIT_SEGMENT);
                  hlsInstance.on(Hls.Events.FRAG_PARSING_INIT_SEGMENT, function(ev, d) {
                    if (d.tracks && d.tracks.audio && d.tracks.audio.codec === 'mp4a.40.1') {
                      d.tracks.audio.codec = 'mp4a.40.2';
                    }
                  });
                  hlsInstance.recoverMediaError();
                }
              });

              hlsInstance.loadSource(videoUrl);
              hlsInstance.attachMedia(player);
              hlsInstance.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
                showPlayer();
                // Try autoplay with sound first, fallback to muted autoplay
                player.volume = 1;
                var playPromise = player.play();
                if (playPromise !== undefined) {
                  playPromise.catch(function(error) {
                    // Autoplay blocked - try muted autoplay then let user unmute
                    console.log('Autoplay blocked, trying muted:', error.name);
                    player.muted = true;
                    player.volume = 1;
                    muteBtn.innerHTML = '&#128263;';
                    volumeSlider.value = 0;
                    player.play().catch(function(){});
                    // Show unmute hint
                    var hint = document.createElement('div');
                    hint.className = 'unmute-overlay';
                    hint.innerHTML = '<span style="font-size:28px">&#128264;</span> Click to Unmute';
                    hint.onclick = function() {
                      player.muted = false;
                      player.volume = 1;
                      muteBtn.innerHTML = '&#128264;';
                      volumeSlider.value = 1;
                      hint.remove();
                    };
                    document.body.appendChild(hint);
                    // Auto-pulse after 2s if still muted
                    setTimeout(function() {
                      if (player.muted && hint.parentNode) {
                        hint.classList.add('pulse');
                      }
                    }, 2000);
                  });
                }
                if (data.levels && data.levels.length > 1) {
                  qualitySelect.style.display = 'inline-block';
                  qualitySelect.innerHTML = '<option value="-1">Auto</option>';
                  data.levels.forEach(function(level, i) {
                    qualitySelect.innerHTML += '<option value="' + i + '">' + level.height + 'p</option>';
                  });
                  qualitySelect.addEventListener('change', function() {
                    hlsInstance.currentLevel = parseInt(this.value);
                  });
                }
              });
              hlsInstance.on(Hls.Events.ERROR, function(event, data) {
                if (data.fatal) {
                  switch(data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      if (retryCount < maxRetries) {
                        retryCount++;
                        setTimeout(function() { hlsInstance.startLoad(); }, 2000);
                      } else {
                        showError('Network error after ' + maxRetries + ' retries. Try another server.');
                      }
                      break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      hlsInstance.recoverMediaError();
                      break;
                    default:
                      showError('HLS stream failed. Try another server.');
                      break;
                  }
                }
              });
            } else if (player.canPlayType('application/vnd.apple.mpegurl')) {
              // Native HLS support (Safari)
              player.src = videoUrl;
              showPlayer();
              player.play().catch(function() {
                player.muted = true;
                player.play().catch(function(){});
              });
            }
          };
          script.onerror = function() {
            player.src = videoUrl;
            showPlayer();
            player.play().catch(function(){});
          };
          document.head.appendChild(script);
        } else {
          // MP4 - load directly
          player.src = videoUrl;
          player.addEventListener('canplay', function onCanPlay() {
            showPlayer();
            player.removeEventListener('canplay', onCanPlay);
          });
          player.addEventListener('playing', function onPlaying() {
            showPlayer();
            player.removeEventListener('playing', onPlaying);
          });
          player.volume = 1;
          var playPromise = player.play();
          if (playPromise !== undefined) {
            playPromise.catch(function() {
              player.muted = true;
              player.volume = 1;
              muteBtn.innerHTML = '&#128263;';
              volumeSlider.value = 0;
              player.play().catch(function(){});
              // Show unmute hint for MP4 too
              var hint = document.createElement('div');
              hint.className = 'unmute-overlay';
              hint.innerHTML = '<span style="font-size:28px">&#128264;</span> Click to Unmute';
              hint.onclick = function() {
                player.muted = false;
                player.volume = 1;
                muteBtn.innerHTML = '&#128264;';
                volumeSlider.value = 1;
                hint.remove();
              };
              document.body.appendChild(hint);
              setTimeout(function() {
                if (player.muted && hint.parentNode) {
                  hint.classList.add('pulse');
                }
              }, 2000);
            });
          }
        }
      }

      player.onerror = function() {
        var err = player.error;
        var msg = 'Failed to load video.';
        if (err) {
          switch(err.code) {
            case 1: msg = 'Video loading was aborted.'; break;
            case 2: msg = 'Network error - the stream may be temporarily unavailable.'; break;
            case 3: msg = 'Video decoding failed.'; break;
            case 4: msg = 'Video format not supported.'; break;
          }
        }
        msg += '<br><small style="color:#999">Try switching servers or reloading.</small>';
        showError(msg);
      };

      loadVideo();

      setTimeout(function() {
        if (loading.style.display !== 'none') {
          showError('Stream is taking too long. Try switching servers or reloading.');
        }
      }, 30000);
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache",
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
