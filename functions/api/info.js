// ============================================================
// Cloudflare Pages Function: POST /api/info
// ============================================================

function extractVideoId(url) {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
  );
  return match ? match[1] : null;
}

// Try multiple YouTube clients - some work better from datacenter IPs
const CLIENTS = [
  {
    name: 'TVHTML5',
    payload: {
      clientName: 'TVHTML5',
      clientVersion: '7.20210224.00.00',
      hl: 'en',
      gl: 'US'
    },
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 Chrome/79.0.3945.88 TV Safari/537.36',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/'
    }
  },
  {
    name: 'WEB',
    payload: {
      clientName: 'WEB',
      clientVersion: '2.20231219.04.00',
      hl: 'en',
      gl: 'US'
    },
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/',
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': '2.20231219.04.00'
    }
  },
  {
    name: 'ANDROID',
    payload: {
      clientName: 'ANDROID',
      clientVersion: '17.31.35',
      androidSdkVersion: 30,
      hl: 'en',
      gl: 'US'
    },
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip',
      'X-Goog-Api-Format-Version': '2'
    }
  }
];

async function fetchYouTubeData(videoId) {
  let lastError = '';
  for (const client of CLIENTS) {
    try {
      const res = await fetch(
        'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
        {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify({
            videoId,
            context: { client: client.payload }
          })
        }
      );
      if (!res.ok) { lastError = `HTTP ${res.status}`; continue; }
      const data = await res.json();
      if (data.playabilityStatus?.status === 'OK') return data;
      lastError = data.playabilityStatus?.reason || 'Video tidak tersedia';
    } catch (e) {
      lastError = e.message;
    }
  }
  throw new Error(lastError || 'Semua metode gagal menghubungi YouTube');
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { url } = body;

    if (!url) return new Response(JSON.stringify({ detail: 'URL wajib diisi' }), { status: 400, headers: corsHeaders });

    const videoId = extractVideoId(url);
    if (!videoId) return new Response(JSON.stringify({ detail: 'URL YouTube tidak valid' }), { status: 400, headers: corsHeaders });

    const data = await fetchYouTubeData(videoId);
    const details = data.videoDetails;
    const thumbnail = details.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
    const formats = [];

    for (const f of data.streamingData?.formats || []) {
      if (!f.url) continue;
      formats.push({
        format_id: String(f.itag),
        ext: f.mimeType?.split(';')[0]?.split('/')[1] || 'mp4',
        resolution: f.qualityLabel || f.quality || 'unknown',
        filesize: f.contentLength ? parseInt(f.contentLength) : 0,
        size_str: formatSize(f.contentLength),
        type: 'video'
      });
    }

    for (const f of data.streamingData?.adaptiveFormats || []) {
      if (!f.url || !f.mimeType?.includes('audio')) continue;
      formats.push({
        format_id: String(f.itag),
        ext: f.mimeType?.split(';')[0]?.split('/')[1] || 'webm',
        abr: f.averageBitrate ? Math.round(f.averageBitrate / 1000) : 0,
        filesize: f.contentLength ? parseInt(f.contentLength) : 0,
        size_str: formatSize(f.contentLength),
        type: 'audio'
      });
    }

    return new Response(JSON.stringify({
      title: details.title,
      thumbnail,
      duration: formatDuration(details.lengthSeconds),
      formats
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ detail: err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
