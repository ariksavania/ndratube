// ============================================================
// Cloudflare Pages Function: POST /api/info
// Strategy: YouTube oEmbed (official) → always works
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

// Fixed quality options — download handled by cobalt.tools in /api/download
const FORMAT_OPTIONS = [
  { format_id: '1080', resolution: '1080p', ext: 'mp4', type: 'video', size_str: 'HD 1080p', abr: 0 },
  { format_id: '720',  resolution: '720p',  ext: 'mp4', type: 'video', size_str: 'HD 720p',  abr: 0 },
  { format_id: '480',  resolution: '480p',  ext: 'mp4', type: 'video', size_str: 'SD 480p',  abr: 0 },
  { format_id: '360',  resolution: '360p',  ext: 'mp4', type: 'video', size_str: 'SD 360p',  abr: 0 },
  { format_id: 'audio_mp3',  resolution: '', ext: 'mp3', type: 'audio', size_str: 'MP3 Audio',  abr: 128 },
  { format_id: 'audio_best', resolution: '', ext: 'm4a', type: 'audio', size_str: 'Best Audio', abr: 256 },
];

export async function onRequestPost(context) {
  try {
    const { url } = await context.request.json();
    if (!url) return new Response(JSON.stringify({ detail: 'URL wajib diisi' }), { status: 400, headers: corsHeaders });

    const videoId = extractVideoId(url);
    if (!videoId) return new Response(JSON.stringify({ detail: 'URL YouTube tidak valid' }), { status: 400, headers: corsHeaders });

    // YouTube oEmbed — official, always works, no API key needed
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'NdraTube/1.0' }
    });

    if (!oembedRes.ok) {
      return new Response(JSON.stringify({ detail: 'Video tidak ditemukan atau tidak tersedia.' }), { status: 404, headers: corsHeaders });
    }

    const oembed = await oembedRes.json();

    // Use YouTube's thumbnail directly (always available)
    const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    return new Response(JSON.stringify({
      title: oembed.title,
      thumbnail,
      duration: '',
      author: oembed.author_name,
      formats: FORMAT_OPTIONS
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ detail: err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
