// ============================================================
// NdraTube - Local Development Server (Node.js / Express)
// Untuk Cloudflare Pages, gunakan functions/api/*.js
// ============================================================

import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const app = express();
const PORT = 8000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'static')));

// ─── YouTube Utility Functions ─────────────────────────────

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

function parseFormats(data) {
  const formats = [];

  // Video + Audio combined formats
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

  // Audio-only adaptive formats
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

  return formats;
}

// ─── API Routes ────────────────────────────────────────────

// POST /api/info
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ detail: 'URL wajib diisi' });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ detail: 'URL YouTube tidak valid' });

  try {
    const data = await fetchYouTubeData(videoId);

    if (data.playabilityStatus?.status !== 'OK') {
      return res.status(400).json({
        detail: data.playabilityStatus?.reason || 'Video tidak tersedia'
      });
    }

    const details = data.videoDetails;
    const thumbnail = details.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';

    res.json({
      title: details.title,
      thumbnail,
      duration: formatDuration(details.lengthSeconds),
      formats: parseFormats(data)
    });

  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// POST /api/download
app.post('/api/download', async (req, res) => {
  const { url, format_id } = req.body;
  if (!url || !format_id) return res.status(400).json({ detail: 'URL dan format_id wajib diisi' });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ detail: 'URL YouTube tidak valid' });

  try {
    const data = await fetchYouTubeData(videoId);

    const allFormats = [
      ...(data.streamingData?.formats || []),
      ...(data.streamingData?.adaptiveFormats || [])
    ];

    const format = allFormats.find(f => String(f.itag) === String(format_id));
    if (!format?.url) return res.status(404).json({ detail: 'Format tidak ditemukan' });

    res.json({ url: format.url });

  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// Fallback: serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

// ─── Start Server ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 NdraTube berjalan di http://localhost:${PORT}\n`);
});
