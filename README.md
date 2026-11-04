# WhatsApp Pure Status Engine (HD Media Optimizer)

Aplikasi dan sistem pemrosesan media berbasis web untuk memastikan video dan foto yang diunggah ke WhatsApp Status tetap jernih dan **tidak pecah**, meniru mekanisme optimasi presisi seperti aplikasi **Pure Status** di Android.

Sistem ini menggunakan arsitektur kolaboratif antara **Google Drive** (penyimpanan cloud tanpa biaya) dan **Firebase Realtime Database (RTDB)** (antrean pekerjaan & sinkronisasi status real-time).

---

## 1. Bagaimana Pure Status Sebenarnya Bekerja & Mengapa Status WA Pecah?

### A. Mengapa Video WhatsApp Status Selalu Pecah?
WhatsApp memiliki modul transcoding internal pada aplikasi klien (Android & iOS). Setiap kali pengguna mengunggah video ke Status, WhatsApp memeriksa parameter stream video tersebut:
1. **Variable Frame Rate (VFR)**: Kamera smartphone umumnya merekam dengan framerate dinamis (misal 28.4 - 31.2 fps sesuai pencahayaan). Decoders WhatsApp menganggap ini tidak standar dan langsung memaksa transcode ulang secara agresif.
2. **Bitrate Melebihi Ambang Batas**: Jika video ber-bitrate tinggi (misal 15–50 Mbps khas kamera HP), WhatsApp melakukan kompresi kasar (fast low-complexity encoder) yang memangkas bitrate hingga di bawah 1.5 Mbps, menghasilkan artefak kotak-kotak (*pixelated*).
3. **Profil & Level Codec**: WhatsApp mengutamakan profil `H.264 Main Profile Level 3.1`. Jika file berformat High Profile L4/5 atau codec HEVC (H.265), WhatsApp merender ulang seluruh file.
4. **Interval Keyframe (GOP)**: Jika jarak keyframe (*intra-frame / I-frame*) terlalu renggang atau tidak teratur, pemotongan status akan buram pada awal klip.
5. **Durasi > 30 Detik**: WhatsApp memotong video panjang secara tidak sinkron sehingga audio terputus dan transisi antar-cerita patah.

### B. Mekanisme Rahasia "Pure Status"
Aplikasi Pure Status pada Android tidak mengubah algoritma WhatsApp, melainkan **mengkondisikan media terlebih dahulu sebelum menyentuh WhatsApp** agar WhatsApp mengenali video tersebut sebagai file yang sudah memenuhi batas toleransi teratasnya (*bypass re-transcoding / minimum loss*):
- **Container**: MP4 standar ISO.
- **Video Codec**: H.264 (AVC) dengan Profil `Main`, Level `3.1`, dan Pixel Format `yuv420p`.
- **Constant Frame Rate (CFR)**: Tepat `30.00 fps` (menghapus fluktuasi VFR).
- **Bitrate Terkendali**: CRF 23 dengan batas ketat `maxrate 2500k` dan `bufsize 5000k`. Ini merupakan *sweet spot* di mana WhatsApp tidak mendeteksi lonjakan bitrate liar.
- **GOP Terkunci**: Keyframe dipaksa muncul setiap 2 detik (`-g 60` pada 30fps).
- **FastStart Atom**: Header `moov atom` dipindahkan ke awal berkas (`-movflags +faststart`) agar *streaming parser* WhatsApp dapat membaca metadata instan tanpa *buffering*.
- **Splitting 30.00 Detik Presisi**: Video panjang dipotong tepat per 30.00 detik dengan *I-frame* di setiap titik potong sehingga sambungan status mulus tanpa jeda audio (*seamless audio crosscut*).
- **Audio Stream**: AAC-LC Stereo, 128 kbps, 44.1 kHz. Jika video tanpa suara, audio stream dinonaktifkan secara aman.
- **Gambar (Foto)**: Bounding box maksimal 1080x1920 (9:16 vertikal) atau 1080x1080, subsampling Chroma 4:2:0, kualitas JPEG 89% dengan ukuran file dijaga 400KB - 850KB (di bawah penalti kompresi 1MB).

---

## 2. Analisis & Evaluasi Kritis: Kolaborasi Firebase RTDB + Google Drive

Pendekatan menggunakan Firebase RTDB + Google Drive + Google Apps Script (GAS) memiliki kelebihan dan kekurangan nyata:

### Kelebihan:
1. **Biaya Operasional Nol (Gratis)**: Google Drive memberikan kapasitas 15 GB gratis, dan Firebase Spark Plan menyediakan koneksi RTDB tanpa biaya bulanan.
2. **Sinkronisasi Antrean Real-time**: RTDB sangat cepat dalam memicu event status pekerjaan (`pending` -> `processing` -> `compressing` -> `uploading` -> `completed`).
3. **Penyimpanan Terpusat**: Pengguna dan worker dapat mengakses berkas melalui satu ekosistem akun Google.

### Kekurangan & Risiko:
1. **Limitasi Payload Google Apps Script (GAS)**:
   - GAS Web App membatasi payload POST maksimal ~50 MB.
   - Karena media diunggah sebagai string Base64 dari browser ke GAS, ukuran data membengkak sekitar 33%. Mengunggah video di atas 35 MB berisiko ditolak GAS atau *timeout*.
2. **Interstisial Download Google Drive**:
   - Tautan `uc?export=download` pada Google Drive untuk berkas besar sering menampilkan halaman HTML konfirmasi virus scan (*can't scan file for viruses*). Sistem ini telah dilengkapi *redirect & confirm handler* otomatis di `worker/driveService.js` untuk mengatasi hal ini.
3. **Keamanan RTDB & Mode Admin**:
   - Jika aturan Firebase diatur `".read": false, ".write": false`, browser pengguna tidak dapat membaca/menulis ke Firebase secara langsung.
   - **Solusi yang Disediakan**: Worker dilengkapi server web dan proxy API internal (`/api/jobs`) yang terintegrasi dengan `firebase-admin` menggunakan `serviceAccountKey.json`. Dengan demikian, antrean tetap dapat diproses secara aman meskipun aturan database terkunci penuh (`read: false, write: false`).

---

## 3. Struktur Berkas Proyek

```
wahtsapp-pure-status/
├── .agents/
│   ├── AGENTS.md                       # Aturan ketat pengembangan & spesifikasi teknis
│   └── skills/
│       └── ffmpeg_pure_status/
│           └── SKILL.md                # Formula FFmpeg & Sharp Pure Status
├── database/
│   ├── database.rules.json             # Aturan keamanan Firebase RTDB
│   └── schema.json                     # Skema data node /queue dan /jobs
├── google-apps-script/
│   └── Code.gs                         # Skrip Web App Google Drive (ID Folder terkonfigurasi)
├── public/                             # Frontend antarmuka web (tanpa komentar & baris kosong)
│   ├── css/
│   │   └── style.css                   # Desain modern responsif
│   ├── js/
│   │   └── app.js                      # Logika upload & pemantau status
│   └── index.html                      # Halaman antarmuka pengguna
├── worker/                             # Daemon pemroses media di background
│   ├── compressor.js                   # Mesin FFmpeg & Sharp (Auto-installer terintegrasi)
│   ├── driveService.js                 # Handler Google Drive (Download/Upload)
│   ├── rtdbService.js                  # Handler Firebase Admin SDK & REST fallback
│   ├── whatsappService.js              # Handler pengiriman media ke WhatsApp Gateway
│   └── index.js                        # Worker pemantau antrean + Server Web/API internal
├── .env.example                        # Template variabel lingkungan
├── .gitignore                          # Filter file privat & secrets
├── package.json                        # Definisi dependensi & skrip eksekusi
└── README.md                           # Dokumentasi sistem lengkap
```

---

## 4. Panduan Menjalankan Sistem

### Langkah 1: Pengaturan Google Drive & Apps Script
1. Buka folder Google Drive Anda:
   `https://drive.google.com/drive/folders/1wA4TD4iOuH5JyNuNK3fR3tzsbIfKn5Vf`
   *(ID Folder: `1wA4TD4iOuH5JyNuNK3fR3tzsbIfKn5Vf` sudah dipasang sebagai default di `google-apps-script/Code.gs`)*.
2. Buka [script.google.com](https://script.google.com) lalu buat proyek baru.
3. Salin isi file `google-apps-script/Code.gs` ke editor Apps Script.
4. Klik **Deploy** -> **New deployment**:
   - Pilih jenis: **Web app**
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
5. Salin URL Web App yang didapat (misal: `https://script.google.com/macros/s/.../exec`).
6. Masukkan URL tersebut ke file `public/js/app.js` pada konfigurasi `gasUrl` dan di file `.env` pada `GOOGLE_APPS_SCRIPT_URL`.

### Langkah 2: Pengaturan Firebase Realtime Database
1. Buka [Firebase Console](https://console.firebase.google.com).
2. Database URL: `https://pure-status-default-rtdb.firebaseio.com`
3. Unduh berkas **Service Account Key**:
   - Masuk ke **Project Settings** -> **Service Accounts**.
   - Klik **Generate new private key**.
   - Simpan berkas tersebut di root folder proyek dengan nama `serviceAccountKey.json`.
4. Jika ingin menggunakan aturan terkunci penuh:
   ```json
   {
     "rules": {
       ".read": false,
       ".write": false
     }
   }
   ```
   *Catatan: Worker akan menggunakan `firebase-admin` dengan Service Account untuk membaca/menulis antrean dan melayani browser via server internal port 3000.*
   Jika ingin browser berkomunikasi langsung ke RTDB tanpa proxy, gunakan aturan dari `database/database.rules.json`.

### Langkah 3: Menjalankan Background Worker & Web
1. Salin file environment:
   ```bash
   cp .env.example .env
   ```
2. Pastikan file `.env` terisi:
   ```env
   FIREBASE_DATABASE_URL=https://pure-status-default-rtdb.firebaseio.com
   FIREBASE_SERVICE_ACCOUNT_KEY=./serviceAccountKey.json
   GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
   WA_GATEWAY_URL=https://api.fonnte.com/send
   WA_API_KEY=TOKEN_ANDA
   PORT=3000
   ```
3. Jalankan aplikasi:
   ```bash
   npm start
   ```
4. Buka peramban ke `http://localhost:3000` untuk menggunakan antarmuka web Pure Status.
