// ============================================================
// Cloudflare Pages Function: POST /api/download
// Strategy: cobalt.tools API (public download service)
// ============================================================

function extractVideoId(url) {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
  );
  return match ? match[1] : null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export async function onRequestPost(context) {
  try {
    const { url, format_id } = await context.request.json();
    if (!url || !format_id) return new Response(JSON.stringify({ detail: 'URL dan format_id wajib diisi' }), { status: 400, headers: corsHeaders });

    const videoId = extractVideoId(url);
    if (!videoId) return new Response(JSON.stringify({ detail: 'URL YouTube tidak valid' }), { status: 400, headers: corsHeaders });

    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const isAudio = format_id.startsWith('audio');

    // Build cobalt.tools request body
    const cobaltBody = {
      url: ytUrl,
      filenameStyle: 'pretty'
    };

    if (isAudio) {
      cobaltBody.downloadMode = 'audio';
      cobaltBody.audioFormat = format_id === 'audio_mp3' ? 'mp3' : 'best';
    } else {
      cobaltBody.downloadMode = 'auto';
      cobaltBody.videoQuality = format_id; // '1080', '720', '480', '360'
    }

    // Call cobalt.tools API
    const cobaltRes = await fetch('https://api.cobalt.tools/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'NdraTube/1.0'
      },
      body: JSON.stringify(cobaltBody)
    });

    if (!cobaltRes.ok) {
      const errText = await cobaltRes.text();
      return new Response(JSON.stringify({ detail: `Cobalt error: ${cobaltRes.status} - ${errText.slice(0, 100)}` }), { status: 502, headers: corsHeaders });
    }

    const cobaltData = await cobaltRes.json();

    if (cobaltData.status === 'error') {
      return new Response(JSON.stringify({ detail: cobaltData.error?.code || 'Gagal mendapatkan link download' }), { status: 400, headers: corsHeaders });
    }

    if (!cobaltData.url) {
      return new Response(JSON.stringify({ detail: 'Tidak ada URL download dari layanan.' }), { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ url: cobaltData.url }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ detail: err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
