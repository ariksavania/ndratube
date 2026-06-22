// ============================================================
// Cloudflare Pages Function: POST /api/info
// Strategy: Piped → Invidious → Innertube (multi-client)
// ============================================================

function extractVideoId(url) {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
  );
  return match ? match[1] : null;
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return 'Unknown Size';
  return `${(parseInt(bytes) / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const sec = parseInt(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Strategy 1: Piped API ─────────────────────────────────
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://piped-api.garudalinux.org',
];

async function fetchViaPiped(videoId) {
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${base}/streams/${videoId}`, {
        headers: { 'User-Agent': 'NdraTube/1.0' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data.title || data.error) continue;

      const formats = [];

      // Video streams (combined video+audio from Piped are usually "videoStreams" where videoOnly=false)
      for (const s of data.videoStreams || []) {
        if (!s.url || s.videoOnly) continue;
        formats.push({
          format_id: `pv_${s.quality}_${s.fps || 30}`,
          ext: s.mimeType?.includes('mp4') ? 'mp4' : 'webm',
          resolution: s.quality,
          filesize: s.contentLength || 0,
          size_str: formatSize(s.contentLength),
          type: 'video',
          url: s.url
        });
      }

      // Audio streams
      for (const s of data.audioStreams || []) {
        if (!s.url) continue;
        formats.push({
          format_id: `pa_${s.quality}`,
          ext: s.mimeType?.includes('mp4') ? 'm4a' : 'webm',
          abr: s.bitrate ? Math.round(s.bitrate / 1000) : 0,
          filesize: s.contentLength || 0,
          size_str: formatSize(s.contentLength),
          type: 'audio',
          url: s.url
        });
      }

      const thumb = data.thumbnailUrl || '';
      return {
        title: data.title,
        thumbnail: thumb,
        duration: formatDuration(data.duration),
        formats
      };
    } catch (e) { continue; }
  }
  return null;
}

// ─── Strategy 2: Invidious API ─────────────────────────────
const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://invidious.privacydev.net',
];

async function fetchViaInvidious(videoId) {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(
        `${base}/api/v1/videos/${videoId}?fields=title,videoThumbnails,lengthSeconds,formatStreams,adaptiveFormats`,
        { headers: { 'User-Agent': 'NdraTube/1.0' }, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (!data.title || data.error) continue;

      const formats = [];
      const thumb = data.videoThumbnails?.find(t => t.quality === 'maxres')?.url
        || data.videoThumbnails?.[0]?.url || '';

      // Combined video+audio streams
      for (const f of data.formatStreams || []) {
        if (!f.url) continue;
        formats.push({
          format_id: `iv_${f.itag}`,
          ext: f.container || 'mp4',
          resolution: f.qualityLabel || f.quality,
          filesize: f.size ? parseInt(f.size) : 0,
          size_str: f.size ? formatSize(parseInt(f.size)) : 'Unknown Size',
          type: 'video',
          url: f.url
        });
      }

      // Audio adaptive formats
      for (const f of data.adaptiveFormats || []) {
        if (!f.url || !f.type?.includes('audio')) continue;
        formats.push({
          format_id: `iva_${f.itag}`,
          ext: f.container || 'webm',
          abr: f.bitrate ? Math.round(parseInt(f.bitrate) / 1000) : 0,
          filesize: f.clen ? parseInt(f.clen) : 0,
          size_str: f.clen ? formatSize(parseInt(f.clen)) : 'Unknown Size',
          type: 'audio',
          url: f.url
        });
      }

      return {
        title: data.title,
        thumbnail: thumb,
        duration: formatDuration(data.lengthSeconds),
        formats
      };
    } catch (e) { continue; }
  }
  return null;
}

// ─── Strategy 3: Innertube (last resort) ───────────────────
const INNERTUBE_CLIENTS = [
  {
    payload: { clientName: 'TVHTML5', clientVersion: '7.20210224.00.00', hl: 'en', gl: 'US' },
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0)', 'Origin': 'https://www.youtube.com', 'Referer': 'https://www.youtube.com/' }
  },
  {
    payload: { clientName: 'WEB', clientVersion: '2.20231219.04.00', hl: 'en', gl: 'US' },
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0', 'Origin': 'https://www.youtube.com', 'Referer': 'https://www.youtube.com/' }
  }
];

async function fetchViaInnertube(videoId) {
  for (const c of INNERTUBE_CLIENTS) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST', headers: c.headers,
        body: JSON.stringify({ videoId, context: { client: c.payload } }),
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.playabilityStatus?.status !== 'OK') continue;

      const details = data.videoDetails;
      const thumbnail = details.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
      const formats = [];

      for (const f of data.streamingData?.formats || []) {
        if (!f.url) continue;
        formats.push({ format_id: String(f.itag), ext: f.mimeType?.split(';')[0]?.split('/')[1] || 'mp4', resolution: f.qualityLabel || f.quality || 'unknown', filesize: f.contentLength ? parseInt(f.contentLength) : 0, size_str: formatSize(f.contentLength), type: 'video', url: f.url });
      }
      for (const f of data.streamingData?.adaptiveFormats || []) {
        if (!f.url || !f.mimeType?.includes('audio')) continue;
        formats.push({ format_id: String(f.itag), ext: f.mimeType?.split(';')[0]?.split('/')[1] || 'webm', abr: f.averageBitrate ? Math.round(f.averageBitrate / 1000) : 0, filesize: f.contentLength ? parseInt(f.contentLength) : 0, size_str: formatSize(f.contentLength), type: 'audio', url: f.url });
      }

      return { title: details.title, thumbnail, duration: formatDuration(details.lengthSeconds), formats };
    } catch (e) { continue; }
  }
  return null;
}

// ─── Handler ───────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export async function onRequestPost(context) {
  try {
    const { url } = await context.request.json();
    if (!url) return new Response(JSON.stringify({ detail: 'URL wajib diisi' }), { status: 400, headers: corsHeaders });

    const videoId = extractVideoId(url);
    if (!videoId) return new Response(JSON.stringify({ detail: 'URL YouTube tidak valid' }), { status: 400, headers: corsHeaders });

    // Try all strategies in order
    const result = await fetchViaPiped(videoId)
      || await fetchViaInvidious(videoId)
      || await fetchViaInnertube(videoId);

    if (!result) return new Response(JSON.stringify({ detail: 'Tidak bisa mengambil data video. Coba lagi.' }), { status: 502, headers: corsHeaders });

    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ detail: err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
