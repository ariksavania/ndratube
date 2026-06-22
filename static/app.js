document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('download-form');
    const urlInput = document.getElementById('url-input');
    const fetchBtn = document.getElementById('fetch-btn');
    const btnText = document.querySelector('.btn-text');
    const spinner = document.getElementById('fetch-spinner');
    const errorMsg = document.getElementById('error-message');

    const resultsContainer = document.getElementById('results-container');
    const videoThumbnail = document.getElementById('video-thumbnail');
    const videoTitle = document.getElementById('video-title');
    const videoDuration = document.getElementById('video-duration');
    const videoFormatsDiv = document.getElementById('video-formats');
    const audioFormatsDiv = document.getElementById('audio-formats');

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Tab Switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = urlInput.value.trim();
        if (!url) return;

        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');
        fetchBtn.disabled = true;
        errorMsg.classList.add('hidden');
        resultsContainer.classList.add('hidden');

        try {
            const response = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Gagal mengambil data video.');
            }

            renderResults(data);

        } catch (error) {
            errorMsg.textContent = error.message;
            errorMsg.classList.remove('hidden');
        } finally {
            btnText.classList.remove('hidden');
            spinner.classList.add('hidden');
            fetchBtn.disabled = false;
        }
    });

    function renderResults(data) {
        videoThumbnail.src = data.thumbnail;
        videoTitle.textContent = data.title;
        videoDuration.textContent = data.duration;

        videoFormatsDiv.innerHTML = '';
        audioFormatsDiv.innerHTML = '';

        const videoFormats = data.formats.filter(f => f.type === 'video').sort((a, b) => b.filesize - a.filesize);
        const audioFormats = data.formats.filter(f => f.type === 'audio').sort((a, b) => b.abr - a.abr);

        if (videoFormats.length === 0) {
            videoFormatsDiv.innerHTML = '<p style="color: var(--text-muted)">Tidak ada format video.</p>';
        } else {
            videoFormats.forEach(format => videoFormatsDiv.appendChild(createFormatCard(format)));
        }

        if (audioFormats.length === 0) {
            audioFormatsDiv.innerHTML = '<p style="color: var(--text-muted)">Tidak ada format audio.</p>';
        } else {
            audioFormats.forEach(format => audioFormatsDiv.appendChild(createFormatCard(format)));
        }

        resultsContainer.classList.remove('hidden');
    }

    function createFormatCard(format) {
        const card = document.createElement('div');
        card.className = 'format-card';

        const quality = format.type === 'video' ? format.resolution : `${format.abr} kbps`;
        const ext = (format.ext || 'mp4').toUpperCase();

        card.innerHTML = `
            <div class="format-quality">${quality}</div>
            <div class="format-details">${ext}</div>
            <div class="format-size">${format.size_str}</div>
            <button class="download-btn">Download</button>
        `;

        const dwnBtn = card.querySelector('.download-btn');

        // ✅ Use direct URL from API response (no second API call needed)
        if (format.url) {
            dwnBtn.addEventListener('click', () => {
                window.open(format.url, '_blank');
            });
        } else {
            // Fallback: disable button if no URL
            dwnBtn.disabled = true;
            dwnBtn.textContent = 'Tidak tersedia';
        }

        return card;
    }
});
