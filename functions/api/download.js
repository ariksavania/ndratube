// ============================================================
// Cloudflare Pages Function: POST /api/download
// ============================================================

function extractVideoId(url) {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
  );
  return match ? match[1] : null;
}

const CLIENTS = [
  {
    payload: { clientName: 'TVHTML5', clientVersion: '7.20210224.00.00', hl: 'en', gl: 'US' },
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 Chrome/79.0.3945.88 TV Safari/537.36',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/'
    }
  },
  {
    payload: { clientName: 'WEB', clientVersion: '2.20231219.04.00', hl: 'en', gl: 'US' },
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/'
    }
  },
  {
    payload: { clientName: 'ANDROID', clientVersion: '17.31.35', androidSdkVersion: 30, hl: 'en', gl: 'US' },
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
          body: JSON.stringify({ videoId, context: { client: client.payload } })
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { url, format_id } = body;

    if (!url || !format_id) return new Response(JSON.stringify({ detail: 'URL dan format_id wajib diisi' }), { status: 400, headers: corsHeaders });

    const videoId = extractVideoId(url);
    if (!videoId) return new Response(JSON.stringify({ detail: 'URL YouTube tidak valid' }), { status: 400, headers: corsHeaders });

    const data = await fetchYouTubeData(videoId);
    const allFormats = [
      ...(data.streamingData?.formats || []),
      ...(data.streamingData?.adaptiveFormats || [])
    ];

    const format = allFormats.find(f => String(f.itag) === String(format_id));
    if (!format?.url) return new Response(JSON.stringify({ detail: 'Format tidak ditemukan' }), { status: 404, headers: corsHeaders });

    return new Response(JSON.stringify({ url: format.url }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ detail: err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
