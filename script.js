// Konfigurasi Worker PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Variabel Global State
let pdfDoc = null;
let pageFlip = null;
let totalPages = 0;
let currentPageNum = 1;
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

        // Render Daftar Isi (TOC) jika ada
        await renderTOC();

        // Render Semua Halaman ke Canvas
        await renderPages();

        // Inisialisasi Flipbook
        initFlipbook();

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
        // pageDiv.style.backgroundColor = 'white'; // Pastikan background putih

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
        flipbookEl.appendChild(pageDiv);

        // Render halaman PDF ke canvas context
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        // Tunggu render selesai sebelum lanjut ke halaman berikutnya (berurutan)
        await page.render(renderContext).promise;
    }
    console.log("Semua halaman selesai dirender ke Canvas.");
}

// --- Integrasi StPageFlip ---

/**
 * Menginisialisasi StPageFlip dengan halaman yang sudah dirender
 */
function initFlipbook() {
    // Pastikan kita menggunakan PageFlip (nama global dari CDN page-flip.browser.js biasanya 'PageFlip')
    // Cek objek global yang tersedia. Biasanya `PageFlip` atau `St.PageFlip`
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

    // Konfigurasi StPageFlip
    pageFlip = new PageFlipClass(flipbookElement, {
        width: 500, // Lebar dasar (bisa disesuaikan)
        height: 700, // Tinggi dasar
        size: 'stretch', // Sesuaikan dengan container induk
        minWidth: 300,
        maxWidth: 2000,
        minHeight: 400,
        maxHeight: 2000,
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

    console.log("Flipbook berhasil diinisialisasi.");
}

// --- Fitur Pencarian ---

/**
 * Mencari teks di seluruh halaman PDF
 */
async function handleSearch() {
    const keyword = searchInput.value.trim().toLowerCase();
    if (!keyword) return;

    // Tampilkan indikator loading (opsional)
    const originalBtnText = searchBtn.textContent;
    searchBtn.textContent = '...';
    searchBtn.disabled = true;

    try {
        let found = false;
        // Mulai pencarian dari halaman setelahnya sampai akhir, lalu dari awal sampai halaman ini
        // Agar pencarian bersifat "Next"

        // Urutan pencarian: (current+1 -> total) lalu (1 -> current)
        const searchOrder = [];
        for (let i = currentPageNum + 1; i <= totalPages; i++) searchOrder.push(i);
        for (let i = 1; i <= currentPageNum; i++) searchOrder.push(i);

        for (const pageNum of searchOrder) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Gabungkan semua item teks di halaman
            const pageText = textContent.items.map(item => item.str).join(' ').toLowerCase();

            if (pageText.includes(keyword)) {
                // Ketemu!
                console.log(`Kata kunci ditemukan di halaman ${pageNum}`);
                if (pageFlip) {
                    pageFlip.flip(pageNum - 1); // Flip ke halaman tersebut
                }
                found = true;
                break; // Berhenti mencari
            }
        }

        if (!found) {
            alert(`Kata "${keyword}" tidak ditemukan.`);
        }

    } catch (error) {
        console.error("Error saat mencari:", error);
    } finally {
        searchBtn.textContent = originalBtnText;
        searchBtn.disabled = false;
    }
}
