// Konfigurasi Worker PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Variabel Global State
let pdfDoc = null;
let pageFlip = null;
let totalPages = 0;
let currentPageNum = 1;
let pendingSearchKeyword = null;
let currentFile = {
    name: '',
    size: 0
};

// Elemen DOM
const uploadContainer = document.getElementById('upload-container');
const viewerContainer = document.getElementById('viewer-container');
const fileInput = document.getElementById('file-input');
const urlInput = document.getElementById('url-input');
const urlBtn = document.getElementById('url-btn');
const flipbookEl = document.getElementById('flipbook');
const tocModal = document.getElementById('toc-modal');
const tocList = document.getElementById('toc-list');
const tocToggleBtn = document.getElementById('toc-toggle-btn');
const closeTocBtn = document.querySelector('.close-toc');

// Elemen Kontrol
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const pageInput = document.getElementById('page-input');
const totalPagesSpan = document.getElementById('total-pages');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

// --- TTS Controls ---
const ttsSpeakBtn = document.getElementById('tts-speak-btn');
const ttsMediaControls = document.getElementById('tts-media-controls');
const ttsPlayBtn = document.getElementById('tts-play-btn');
const ttsPauseBtn = document.getElementById('tts-pause-btn');
const ttsStopBtn = document.getElementById('tts-stop-btn');

// --- Event Listeners ---

// Upload & URL
fileInput.addEventListener('change', handleFileUpload);
urlBtn.addEventListener('click', handleUrlLoad);

// Navigasi Halaman
prevBtn.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipPrev();
});

nextBtn.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipNext();
});

pageInput.addEventListener('change', (e) => {
    if (!pageFlip) return;
    const page = parseInt(e.target.value);
    if (page >= 1 && page <= totalPages) {
        // StPageFlip menggunakan index 0-based
        pageFlip.flip(page - 1);
    } else {
        pageInput.value = currentPageNum;
    }
});

// TOC Toggle
tocToggleBtn.addEventListener('click', () => {
    tocModal.classList.remove('hidden');
    setTimeout(() => tocModal.classList.add('active'), 10); // Trigger animasi
});

closeTocBtn.addEventListener('click', () => {
    tocModal.classList.remove('active');
    setTimeout(() => tocModal.classList.add('hidden'), 300); // Tunggu animasi selesai
});

// Tutup TOC jika klik di luar konten
tocModal.addEventListener('click', (e) => {
    if (e.target === tocModal) {
        tocModal.classList.remove('active');
        setTimeout(() => tocModal.classList.add('hidden'), 300);
    }
});

// Search Event
searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});

// --- TTS Event Listeners ---

// Toggle TTS Mode
ttsSpeakBtn.addEventListener('click', async () => {
    // Jika sedang berbicara, kita stop dulu? Atau hanya toggle menu?
    // Mari kita toggle menu dan auto-start play jika belum
    const isHidden = ttsMediaControls.classList.contains('hidden');

    if (isHidden) {
        // Tampilkan kontrol
        ttsMediaControls.classList.remove('hidden');
        ttsSpeakBtn.style.color = '#007bff'; // Indikator aktif

        // Auto start reading current page if not already speaking
        if (!window.speechSynthesis.speaking) {
            await TTSManager.speakCurrentPage();
        }
    } else {
        // Sembunyikan kontrol
        ttsMediaControls.classList.add('hidden');
        ttsSpeakBtn.style.color = ''; // Reset warna

        // Opsional: Stop berbicara saat menu ditutup?
        // User request: "Stop" button exists. So maybe closing just hides controls.
        // But for UX, usually closing the mode stops the action.
        // Let's keep it running unless Stop is pressed, as user wanted separate controls.
    }
});

ttsPlayBtn.addEventListener('click', async () => {
    if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
    } else if (!window.speechSynthesis.speaking) {
        await TTSManager.speakCurrentPage();
    }
});

ttsPauseBtn.addEventListener('click', () => {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
    }
});

ttsStopBtn.addEventListener('click', () => {
    window.speechSynthesis.cancel();
});


// --- Helper Functions ---

/**
 * Membaca file sebagai ArrayBuffer
 * @param {File} file - File objek dari input
 * @returns {Promise<ArrayBuffer>}
 */
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Menyimpan halaman terakhir ke localStorage
 * Format Key: pdf_bookmark_NAMAFILE_UKURAN
 */
function saveBookmark(pageIndex) {
    if (!currentFile.name) return;
    const key = `pdf_bookmark_${currentFile.name}_${currentFile.size}`;
    localStorage.setItem(key, pageIndex);
}

/**
 * Memuat halaman terakhir dari localStorage
 * @returns {number|null} Index halaman (0-based) atau null jika tidak ada
 */
function loadBookmark(filename, filesize) {
    const key = `pdf_bookmark_${filename}_${filesize}`;
    const savedPage = localStorage.getItem(key);
    return savedPage ? parseInt(savedPage) : null;
}

// --- Handler Utama ---

function handleUrlLoad() {
    alert("Fitur URL via Proxy GAS akan hadir di Fase 2");
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        alert('Mohon unggah file PDF yang valid.');
        return;
    }

    try {
        // Simpan info file
        currentFile.name = file.name;
        currentFile.size = file.size;

        // Baca file
        const data = await readFileAsArrayBuffer(file);

        // Sembunyikan upload UI
        uploadContainer.classList.add('hidden');
        viewerContainer.classList.remove('hidden');

        // Muat Dokumen PDF
        await loadPdfDocument(data);

    } catch (error) {
        console.error("Gagal memuat file:", error);
        alert("Terjadi kesalahan saat memuat file PDF.");
    }
}

// --- Logika PDF Rendering ---

/**
 * Memuat dokumen PDF menggunakan PDF.js dan merender halaman
 * @param {ArrayBuffer} data - Data file PDF
 */
async function loadPdfDocument(data) {
    try {
        // Memuat dokumen PDF
        const loadingTask = pdfjsLib.getDocument({ data: data });
        pdfDoc = await loadingTask.promise;
        totalPages = pdfDoc.numPages;

        // Update UI info
        totalPagesSpan.textContent = totalPages;

        console.log(`Dokumen dimuat: ${totalPages} halaman.`);

        // Dapatkan dimensi halaman pertama untuk konfigurasi aspect ratio
        const page1 = await pdfDoc.getPage(1);
        const viewport = page1.getViewport({ scale: 1 });
        const pdfWidth = viewport.width;
        const pdfHeight = viewport.height;
        console.log(`Dimensi PDF Asli: ${pdfWidth}x${pdfHeight}`);

        // Render Daftar Isi (TOC) jika ada
        await renderTOC();

        // Render Semua Halaman ke Canvas
        await renderPages();

        // Inisialisasi Flipbook dengan dimensi yang sesuai
        initFlipbook(pdfWidth, pdfHeight);

    } catch (error) {
        console.error("Error saat memuat dokumen PDF:", error);
        alert("Gagal memuat dokumen PDF.");
    }
}

/**
 * Merender Daftar Isi (Outline) ke dalam Modal
 */
async function renderTOC() {
    const outline = await pdfDoc.getOutline();
    tocList.innerHTML = ''; // Bersihkan daftar lama

    if (!outline || outline.length === 0) {
        tocList.innerHTML = '<li style="padding:10px; color:#666;">Tidak ada daftar isi.</li>';
        return;
    }

    // Fungsi rekursif untuk memproses item TOC
    const processItems = (items, level = 0) => {
        items.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.title;
            li.style.paddingLeft = `${level * 15 + 10}px`; // Indentasi sederhana
            li.style.fontSize = '14px';

            li.addEventListener('click', async () => {
                try {
                    // Mendapatkan tujuan (dest) dan mengonversinya ke index halaman
                    let dest = item.dest;
                    if (typeof dest === 'string') {
                        dest = await pdfDoc.getDestination(dest);
                    }

                    if (dest) {
                        const pageRef = dest[0];
                        // getPageIndex mengembalikan index 0-based
                        const pageIndex = await pdfDoc.getPageIndex(pageRef);

                        if (pageFlip) {
                            pageFlip.flip(pageIndex);
                        }

                        // Tutup modal
                        tocModal.classList.remove('active');
                        setTimeout(() => tocModal.classList.add('hidden'), 300);
                    }
                } catch (err) {
                    console.error("Error navigasi TOC:", err);
                }
            });

            tocList.appendChild(li);

            // Proses sub-item jika ada
            if (item.items && item.items.length > 0) {
                processItems(item.items, level + 1);
            }
        });
    };

    processItems(outline);
}

// --- Helper for Text Layer Scaling ---
const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
        updatePageScale(entry.target);
    }
});

function updatePageScale(pageElement) {
    const textLayer = pageElement.querySelector('.textLayer');
    if (!textLayer) return;

    const viewportWidth = parseFloat(textLayer.getAttribute('data-viewport-width'));
    const viewportHeight = parseFloat(textLayer.getAttribute('data-viewport-height'));
    if (!viewportWidth || !viewportHeight) return;

    const clientWidth = pageElement.clientWidth;
    const clientHeight = pageElement.clientHeight;

    if (clientWidth === 0 || clientHeight === 0) return;

    // Use containment logic (similar to object-fit: contain)
    const scaleX = clientWidth / viewportWidth;
    const scaleY = clientHeight / viewportHeight;
    const scale = Math.min(scaleX, scaleY);

    const imgWidth = viewportWidth * scale;
    const imgHeight = viewportHeight * scale;

    const offsetX = (clientWidth - imgWidth) / 2;
    const offsetY = (clientHeight - imgHeight) / 2;

    textLayer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

/**
 * Merender setiap halaman PDF ke dalam elemen Canvas
 */
async function renderPages() {
    flipbookEl.innerHTML = ''; // Bersihkan container

    // Loop semua halaman
    for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i);

        // Buat container div untuk halaman (diperlukan oleh StPageFlip)
        const pageDiv = document.createElement('div');
        pageDiv.classList.add('page');
        pageDiv.setAttribute('data-page-index', i - 1); // Store 0-based index
        // pageDiv.style.backgroundColor = 'white'; // Ditangani di CSS

        // Buat elemen Canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Tentukan skala viewport
        // Skala 1.5 memberikan ketajaman yang cukup baik
        const viewport = page.getViewport({ scale: 1.5 });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // CSS agar canvas menyesuaikan container div
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain'; // Jaga aspek rasio

        pageDiv.appendChild(canvas);

        // --- TEXT LAYER START ---
        const textLayerDiv = document.createElement('div');
        textLayerDiv.classList.add('textLayer');
        // Set dimensions to match the viewport (PDF coordinates * scale)
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        // Set scale factor for PDF.js Text Layer
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
        // Store for scaling
        textLayerDiv.setAttribute('data-viewport-width', viewport.width);
        textLayerDiv.setAttribute('data-viewport-height', viewport.height);

        // --- FIX: Stop propagation of mouse/touch events on Text Layer ---
        // This prevents StPageFlip from intercepting clicks on the text, allowing native text selection.
        const stopProp = (e) => {
            e.stopPropagation();
        };

        textLayerDiv.addEventListener('mousedown', stopProp);
        textLayerDiv.addEventListener('touchstart', stopProp);
        textLayerDiv.addEventListener('pointerdown', stopProp);
        textLayerDiv.addEventListener('touchend', stopProp);
        textLayerDiv.addEventListener('click', stopProp);

        pageDiv.appendChild(textLayerDiv);

        // Observe resize
        resizeObserver.observe(pageDiv);

        flipbookEl.appendChild(pageDiv);

        // Render halaman PDF ke canvas context
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        // Tunggu render selesai sebelum lanjut ke halaman berikutnya (berurutan)
        await page.render(renderContext).promise;

        // Render Text Layer (async but waited here to ensure order)
        try {
            const textContent = await page.getTextContent();
            await pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: viewport,
                textDivs: []
            }).promise;
        } catch (e) {
            console.error(`Error rendering text layer for page ${i}:`, e);
        }
    }
    console.log("Semua halaman selesai dirender ke Canvas.");
}

// --- Integrasi StPageFlip ---

/**
 * Menginisialisasi StPageFlip dengan halaman yang sudah dirender
 */
function initFlipbook(width, height) {
    // Pastikan kita menggunakan PageFlip
    let PageFlipClass = window.PageFlip;
    if (!PageFlipClass && window.St && window.St.PageFlip) {
        PageFlipClass = window.St.PageFlip;
    }

    if (!PageFlipClass) {
        console.error("Library PageFlip tidak ditemukan. Cek koneksi internet atau URL CDN.");
        alert("Gagal memuat library efek flipbook.");
        return;
    }

    const flipbookElement = document.getElementById('flipbook');

    // Pastikan container bersih dari instance sebelumnya jika ada
    if (pageFlip) {
        // Idealnya destroy instance lama jika mendukung
        try {
           pageFlip.destroy();
        } catch(e) {
           console.log("Gagal destroy pageFlip lama", e);
        }
        pageFlip = null;
    }

    // Konfigurasi StPageFlip
    pageFlip = new PageFlipClass(flipbookElement, {
        width: width, // Gunakan lebar asli PDF
        height: height, // Gunakan tinggi asli PDF
        size: 'stretch', // Sesuaikan dengan container induk
        // Atur batasan scaling agar rasio tetap terjaga
        minWidth: 200,
        maxWidth: 3000,
        minHeight: 200 * (height / width),
        maxHeight: 3000 * (height / width),

        showCover: true, // Halaman pertama adalah cover
        usePortrait: true, // Otomatis 1 halaman di layar sempit (Portrait)
        maxShadowOpacity: 0.5, // Opasitas bayangan lipatan
        mobileScrollSupport: false, // Matikan scroll browser saat swipe di buku
        startPage: 0 // Mulai dari halaman 0 (index)
    });

    // Muat halaman dari DOM (elemen .page yang kita buat di renderPages)
    pageFlip.loadFromHTML(document.querySelectorAll('.page'));

    // Event Listener: Saat halaman dibalik
    pageFlip.on('flip', (e) => {
        // e.data adalah index halaman (0-based)
        const newPageIndex = e.data;
        currentPageNum = newPageIndex + 1; // Konversi ke 1-based untuk UI

        // Update input halaman
        pageInput.value = currentPageNum;

        // Simpan posisi baca (bookmark)
        saveBookmark(newPageIndex);

        // Handle pending search highlight
        if (pendingSearchKeyword) {
            // Apply highlight after a delay to ensure page is visible
            setTimeout(() => {
                performSearchHighlight(pendingSearchKeyword, newPageIndex);
                pendingSearchKeyword = null;
            }, 500); // Tunggu animasi flip selesai
        }
    });

    // Cek apakah ada bookmark tersimpan
    const savedPage = loadBookmark(currentFile.name, currentFile.size);
    if (savedPage !== null && savedPage >= 0 && savedPage < totalPages) {
        console.log("Mengembalikan posisi ke halaman:", savedPage + 1);
        // Flip ke halaman tersimpan (beri delay sedikit)
        setTimeout(() => {
            pageFlip.flip(savedPage);
        }, 500);
    }

    console.log("Flipbook berhasil diinisialisasi dengan dimensi:", width, "x", height);
}

// --- Fitur Pencarian ---

function clearHighlights() {
    const highlights = document.querySelectorAll('.textLayer .highlighted');
    highlights.forEach(el => el.classList.remove('highlighted'));
}

/**
 * Highlights text on a specific page
 * @param {string} keyword
 * @param {number} pageIndex 0-based index
 */
function performSearchHighlight(keyword, pageIndex) {
    if (!keyword) return;

    // Find the page element
    // StPageFlip might move elements, so we look for our marker attribute
    const pages = document.querySelectorAll('.page');
    let targetPage = null;
    for (const p of pages) {
        if (parseInt(p.getAttribute('data-page-index')) === pageIndex) {
            targetPage = p;
            break;
        }
    }

    if (!targetPage) return;

    const textLayer = targetPage.querySelector('.textLayer');
    if (!textLayer) return;

    const spans = textLayer.querySelectorAll('span');
    let foundInSpans = false;

    // Remove old highlights on this page
    spans.forEach(span => span.classList.remove('highlighted'));

    // Simple span-based matching
    spans.forEach(span => {
        if (span.textContent.toLowerCase().includes(keyword)) {
            span.classList.add('highlighted');
            foundInSpans = true;
        }
    });

    // Fallback: Browser native find/select
    // This is useful for "Find Next" functionality or if spans are fragmented
    if (window.find) {
        // We try to focus the window and find
        // Note: window.find is global, so it might jump. But we just flipped to the page.
        try {
            window.getSelection().removeAllRanges();
            window.find(keyword, false, false, true, false, true, false);
        } catch (e) {
            console.log("Window find failed", e);
        }
    }
}


/**
 * Mencari teks di seluruh halaman PDF
 */
async function handleSearch() {
    const keywordRaw = searchInput.value.trim();
    if (!keywordRaw) return;

    const keyword = keywordRaw.toLowerCase();

    // Clear previous visual highlights globally
    clearHighlights();

    // Tampilkan indikator loading
    const originalBtnText = searchBtn.textContent;
    searchBtn.disabled = true;

    try {
        let found = false;

        // Urutan pencarian: (current+1 -> total) lalu (1 -> current)
        const searchOrder = [];
        for (let i = currentPageNum + 1; i <= totalPages; i++) searchOrder.push(i);
        for (let i = 1; i <= currentPageNum; i++) searchOrder.push(i);

        // Loop pencarian
        for (const pageNum of searchOrder) {
            // Update UI agar user tahu proses sedang berjalan
            searchBtn.textContent = `${pageNum}`;

            // Beri jeda sedikit agar UI thread tidak freeze
            await new Promise(r => setTimeout(r, 0));

            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Strategi Ekstraksi Teks:
            const items = textContent.items.map(item => item.str);
            const textSpaced = items.join(' ').toLowerCase();
            const textJoined = items.join('').toLowerCase();

            // Cek apakah keyword ada
            if (textSpaced.includes(keyword) || textJoined.includes(keyword)) {
                // Ketemu!
                console.log(`Kata kunci "${keyword}" ditemukan di halaman ${pageNum}`);

                if (pageFlip) {
                    const targetIndex = pageNum - 1;

                    // Set pending keyword so event listener handles the highlight after animation
                    pendingSearchKeyword = keyword;

                    if (pageFlip.getCurrentPageIndex() === targetIndex) {
                        // Jika sudah di halaman tersebut, trigger manual
                        performSearchHighlight(keyword, targetIndex);
                        pendingSearchKeyword = null; // Clear because we handled it
                    } else {
                        // Flip and let event listener handle it
                        pageFlip.flip(targetIndex);
                    }
                }
                found = true;
                break; // Berhenti mencari setelah ketemu yang pertama (Next)
            }
        }

        if (!found) {
            alert(`Kata "${keywordRaw}" tidak ditemukan.`);
        }

    } catch (error) {
        console.error("Error saat mencari:", error);
        alert("Terjadi kesalahan saat mencari.");
    } finally {
        // Kembalikan tombol ke keadaan semula
        searchBtn.textContent = originalBtnText;
        searchBtn.disabled = false;
        // Fokus kembali ke input
        searchInput.focus();
    }
}

// --- Manajer Text-to-Speech (TTS) ---
const TTSManager = {
    /**
     * Mendapatkan suara laki-laki bahasa Indonesia jika tersedia.
     * Prioritas: Nama mengandung "Male", "Pria", "Laki", "Ardi", "Andika", "David".
     * Fallback: Suara Indonesia apa saja.
     */
    getIndonesianMaleVoice() {
        const voices = window.speechSynthesis.getVoices();

        // Filter suara bahasa Indonesia (id-ID atau id)
        const indonesianVoices = voices.filter(voice => voice.lang.includes('id'));

        if (indonesianVoices.length === 0) {
            console.warn("TTS: Tidak ditemukan suara Bahasa Indonesia.");
            return null;
        }

        // Cari suara laki-laki
        const maleKeywords = ['male', 'pria', 'cowok', 'laki', 'ardi', 'andika', 'david'];
        const maleVoice = indonesianVoices.find(voice => {
            const name = voice.name.toLowerCase();
            return maleKeywords.some(keyword => name.includes(keyword));
        });

        if (maleVoice) {
            console.log(`TTS: Menggunakan suara laki-laki: ${maleVoice.name}`);
            return maleVoice;
        }

        console.log(`TTS: Suara laki-laki spesifik tidak ditemukan. Menggunakan fallback: ${indonesianVoices[0].name}`);
        return indonesianVoices[0];
    },

    async speakCurrentPage() {
        if (!pdfDoc) return;

        // Cancel previous speech
        window.speechSynthesis.cancel();

        try {
            // Get current page number (1-based)
            const pageNum = currentPageNum;
            console.log(`TTS: Processing page ${pageNum}`);

            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Join text items with space
            let textToSpeak = textContent.items.map(item => item.str).join(' ');

            if (!textToSpeak.trim()) {
                alert("Tidak ada teks yang dapat dibaca pada halaman ini.");
                return;
            }

            console.log("TTS Text:", textToSpeak.substring(0, 50) + "...");

            // Create Utterance
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.lang = 'id-ID'; // Indonesian
            utterance.rate = 1.0;

            // Set Voice (Male preference)
            const preferredVoice = this.getIndonesianMaleVoice();
            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }

            utterance.onstart = () => {
                console.log("TTS Started");
                ttsPlayBtn.textContent = '🔊';
                ttsPlayBtn.style.color = '#28a745';
            };

            utterance.onend = () => {
                console.log("TTS Finished");
                ttsPlayBtn.textContent = '▶';
                ttsPlayBtn.style.color = '';
            };

            utterance.onerror = (e) => {
                console.error("TTS Error:", e);
                ttsPlayBtn.textContent = '▶';
                ttsPlayBtn.style.color = '';
            };

            window.speechSynthesis.speak(utterance);

        } catch (error) {
            console.error("TTS Failed:", error);
            alert("Gagal membaca teks halaman.");
        }
    }
};

// --- Inisialisasi Suara TTS ---
// Memastikan daftar suara termuat (khususnya untuk browser seperti Chrome)
if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
        // Trigger getVoices untuk mempopulate cache browser
        window.speechSynthesis.getVoices();
    };
}
