# Panduan Agen - WhatsApp Pure Status Engine

Dokumentasi ini adalah pedoman teknis dan aturan pengkodean untuk proyek WhatsApp Pure Status Engine (Frontend Web, Firebase Realtime Database, Google Drive Storage, dan Backend Worker Pemroses Media).

## 1. Arsitektur & Alur Sistem
1. **Frontend**: Pengguna mengunggah video atau gambar melalui antarmuka web, mengisi nomor tujuan WhatsApp, serta teks caption.
2. **Penyimpanan Input (Google Drive)**: Media mentah diunggah ke Google Drive melalui Google Apps Script Web App (mirip ekosistem musada.sch.id).
3. **Antrean Pekerjaan (Firebase RTDB)**: Metadata pekerjaan (`jobId`, URL sumber drive, nomor WA, opsi caption, jenis file, timestamp) didorong ke node `/queue/{jobId}` di Firebase RTDB.
4. **Backend Processing Worker**:
   - Worker memantau node `/queue` di RTDB secara real-time.
   - Mengunduh file mentah dari Google Drive.
   - Menerapkan algoritma kompresi presisi tinggi (Pure Status algorithm) via FFmpeg / Sharp.
   - Memecah video menjadi klip persis 30.00 detik jika durasi melebihi 30 detik agar tidak terpotong acak oleh WhatsApp.
   - Mengunggah file hasil kompresi kembali ke Google Drive folder output.
   - Memperbarui status di RTDB (`pending` -> `processing` -> `completed` / `error`).
   - Mengirimkan media hasil kompresi langsung ke nomor WhatsApp tujuan via WhatsApp Gateway / Baileys.

## 2. Parameter Kompresi Pure Status (FFmpeg & Image)
### Video (Mencegah Algoritma Transcoding Agresif WhatsApp)
WhatsApp otomatis mengompres ulang video jika profil, framerate, atau bitrate tidak sesuai standar internalnya. Standar Pure Status adalah:
- **Container**: MP4
- **Video Codec**: H.264 (AVC), Profile: Main, Level: 3.1
- **Pixel Format**: yuv420p
- **Framerate**: Wajib 30.00 fps Constant Frame Rate (CFR), hindari Variable Frame Rate (VFR)
- **Resolusi**: 720x1280 (vertical 9:16) atau 1080x1920 jika bitrate terkontrol
- **Bitrate Kontrol**: CRF 23, `maxrate 2500k`, `bufsize 5000k`
- **GOP (Keyframe)**: `-g 60` (keyframe setiap 2 detik pada 30fps)
- **Header**: `-movflags +faststart` (moov atom di awal file)
- **Audio**: AAC-LC, Stereo, 128 kbps, 44100 Hz
- **Splitting**: Setiap 30.00 detik tanpa jeda audio (`-segment_time 30 -reset_timestamps 1`)

### Gambar (Optimal Image)
- **Dimensi**: Maksimal 1080x1920 (atau bounding box 1920px mempertahankan aspek rasio)
- **Format**: JPEG kualitas 88-90% dengan Chroma Subsampling 4:2:0
- **Ukuran File**: Target 400KB - 850KB (di bawah batas penalti kompresi WhatsApp 1MB)
- **Metadata**: Strip EXIF metadata berat untuk efisiensi header

## 3. Standar Pengkodean Wajib (Strict Rules)
1. **Dilarang Komentar**: File HTML, CSS, dan JS tidak boleh memuat komentar apapun.
2. **Dilarang Baris Kosong (No Blank Lines)**: Struktur kode HTML, CSS, dan JS harus padat dan rapi tanpa baris kosong berlebih.
3. **Dilarang Inline CSS dan JS**: Dilarang menggunakan atribut `style=""` atau event inline seperti `onclick=""`. Semua pemformatan di file CSS dan logika di file JS.
4. **Dilarang Cache Busting**: Jangan tambahkan query string seperti `?v=1.0` pada pemanggilan CSS/JS.
5. **Mencegah Grid Blowout**: Gunakan `min-width: 0;` pada direct children dari grid container.
6. **Responsif & Text Break**: Gunakan `overflow-wrap: break-word;` dan padding proporsional pada tampilan seluler (< 768px).
7. **Encoding UTF-8**: Selalu gunakan UTF-8 tanpa BOM. Jangan pernah gunakan manipulasi teks PowerShell yang merusak karakter multibyte.

