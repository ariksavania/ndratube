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

    let currentUrl = '';

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
        
        currentUrl = url;

        // UI Loading State
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');
        fetchBtn.disabled = true;
        errorMsg.classList.add('hidden');
        resultsContainer.classList.add('hidden');

        try {
            const response = await fetch('/api/info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to fetch video details.');
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
        // Populate Header
        videoThumbnail.src = data.thumbnail;
        videoTitle.textContent = data.title;
        videoDuration.textContent = data.duration;

        // Clear Formats
        videoFormatsDiv.innerHTML = '';
        audioFormatsDiv.innerHTML = '';

        // Separate & Sort Formats
        const videoFormats = data.formats.filter(f => f.type === 'video').sort((a, b) => b.filesize - a.filesize);
        const audioFormats = data.formats.filter(f => f.type === 'audio').sort((a, b) => b.abr - a.abr);

        // Render Video Formats
        if (videoFormats.length === 0) {
            videoFormatsDiv.innerHTML = '<p style="color: var(--text-muted)">No video formats found.</p>';
        } else {
            videoFormats.forEach(format => {
                const card = createFormatCard(format);
                videoFormatsDiv.appendChild(card);
            });
        }

        // Render Audio Formats
        if (audioFormats.length === 0) {
            audioFormatsDiv.innerHTML = '<p style="color: var(--text-muted)">No audio formats found.</p>';
        } else {
            audioFormats.forEach(format => {
                const card = createFormatCard(format);
                audioFormatsDiv.appendChild(card);
            });
        }

        resultsContainer.classList.remove('hidden');
    }

    function createFormatCard(format) {
        const card = document.createElement('div');
        card.className = 'format-card';
        
        const quality = format.type === 'video' ? format.resolution : `${format.abr} kbps`;
        const ext = format.ext.toUpperCase();

        card.innerHTML = `
            <div class="format-quality">${quality}</div>
            <div class="format-details">${ext}</div>
            <div class="format-size">${format.size_str}</div>
            <button class="download-btn" data-id="${format.format_id}" data-type="${format.type}">Download</button>
        `;

        const dwnBtn = card.querySelector('.download-btn');
        dwnBtn.addEventListener('click', () => handleDownload(dwnBtn, format.format_id, format.type));

        return card;
    }

    async function handleDownload(btn, formatId, type) {
        const originalText = btn.textContent;
        btn.textContent = 'Preparing...';
        btn.disabled = true;

        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    url: currentUrl,
                    format_id: formatId,
                    type: type
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to get download link.');
            }

            // Redirect browser to the direct URL for downloading
            // Or create a temporary anchor element to trigger download
            const a = document.createElement('a');
            a.href = data.url;
            a.setAttribute('download', '');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

        } catch (error) {
            alert(error.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
});
