---
name: ffmpeg_pure_status
description: Skrip dan referensi teknis encoding video dan optimasi gambar untuk WhatsApp Status berkualitas jernih tanpa pecah (Pure Status standard).
---

# FFmpeg Pure Status Optimizer

Keahlian ini menyediakan parameter FFmpeg dan algoritma pengolahan gambar yang dikalibrasi secara presisi untuk melewati algoritma kompresi agresif WhatsApp Status.

## 1. Algoritma Video WhatsApp Status
WhatsApp melakukan re-transcoding jika parameter video tidak cocok dengan decoder internal WhatsApp Android/iOS.
Gunakan formula berikut:

```bash
ffmpeg -y -i input.mp4 \
  -vf "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,setsar=1" \
  -c:v libx264 \
  -preset medium \
  -profile:v main \
  -level 3.1 \
  -crf 23 \
  -maxrate 2500k \
  -bufsize 5000k \
  -r 30 \
  -g 60 \
  -pix_fmt yuv420p \
  -c:a aac \
  -b:a 128k \
  -ar 44100 \
  -movflags +faststart \
  output.mp4
```

## 2. Pemecah Klip Video 30 Detik (Story Slicing)
WhatsApp Status memiliki batas durasi per status 30 detik. Untuk video panjang:

```bash
ffmpeg -y -i input.mp4 \
  -c:v libx264 -preset fast -profile:v main -level 3.1 -crf 23 -maxrate 2500k -bufsize 5000k -r 30 -g 60 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 44100 \
  -f segment \
  -segment_time 30 \
  -reset_timestamps 1 \
  -movflags +faststart \
  output_%03d.mp4
```

## 3. Pembubuhan Caption (Teks pada Video)
Untuk membubuhkan caption di atas kanvas video:

```bash
ffmpeg -y -i input.mp4 \
  -vf "drawtext=text='Teks Caption':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=h-th-80" \
  ...
```

## 4. Optimasi Gambar (Sharp / Pillow)
Untuk gambar, sesuaikan ukuran ke 1080x1920 (9:16) atau 1080x1080, kualitas JPEG 88-90, subsampling 4:2:0:
```javascript
await sharp(inputBuffer)
  .resize(1080, 1920, { fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 89, chromaSubsampling: '4:2:0' })
  .toFile(outputPath);
```

