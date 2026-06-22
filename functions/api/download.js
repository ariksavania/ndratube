// ============================================================
// Cloudflare Pages Function: POST /api/download
// ============================================================

function extractVideoId(url) {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
  );
  return match ? match[1] : null;
}

async function fetchYouTubeData(videoId) {
  const res = await fetch(
    'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip',
        'X-Goog-Api-Format-Version': '2'
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '17.31.35',
            androidSdkVersion: 30,
            hl: 'en',
            gl: 'US'
          }
        }
      })
    }
  );
  if (!res.ok) throw new Error('Gagal menghubungi YouTube');
  return res.json();
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

    if (!url || !format_id) {
      return new Response(JSON.stringify({ detail: 'URL dan format_id wajib diisi' }), {
        status: 400, headers: corsHeaders
      });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return new Response(JSON.stringify({ detail: 'URL YouTube tidak valid' }), {
        status: 400, headers: corsHeaders
      });
    }

    const data = await fetchYouTubeData(videoId);

    const allFormats = [
      ...(data.streamingData?.formats || []),
      ...(data.streamingData?.adaptiveFormats || [])
    ];

    const format = allFormats.find(f => String(f.itag) === String(format_id));
    if (!format?.url) {
      return new Response(JSON.stringify({ detail: 'Format tidak ditemukan' }), {
        status: 404, headers: corsHeaders
      });
    }

    return new Response(JSON.stringify({ url: format.url }), {
      status: 200, headers: corsHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ detail: err.message }), {
      status: 500, headers: corsHeaders
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
