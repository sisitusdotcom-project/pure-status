const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  if (ffmpegInstaller && ffmpegInstaller.path) {
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  }
} catch (e) {}
try {
  const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
  if (ffprobeInstaller && ffprobeInstaller.path) {
    ffmpeg.setFfprobePath(ffprobeInstaller.path);
  }
} catch (e) {}
function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata && metadata.format && metadata.format.duration ? Number(metadata.format.duration) : 0;
      const hasAudio = metadata && metadata.streams && metadata.streams.some(s => s.codec_type === 'audio');
      resolve({ duration, hasAudio });
    });
  });
}
function processVideoSegment(inputPath, outputPath, startTime, duration, captionText, burnCaption, hasAudio) {
  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);
    if (startTime !== null && startTime !== undefined) {
      command = command.setStartTime(startTime);
    }
    if (duration !== null && duration !== undefined) {
      command = command.setDuration(duration);
    }
    let filterString = 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,setsar=1';
    if (burnCaption && captionText) {
      const sanitizedCaption = captionText.replace(/'/g, '').replace(/:/g, '\\:');
      filterString += `,drawtext=text='${sanitizedCaption}':fontcolor=white:fontsize=28:box=1:boxcolor=black@0.6:boxborderw=12:x=(w-text_w)/2:y=h-th-90`;
    }
    command
      .videoFilters(filterString)
      .videoCodec('libx264')
      .outputOptions([
        '-preset fast',
        '-profile:v main',
        '-level 3.1',
        '-crf 22',
        '-maxrate 2500k',
        '-bufsize 5000k',
        '-r 30',
        '-g 60',
        '-pix_fmt yuv420p',
        '-movflags +faststart'
      ]);
    if (hasAudio) {
      command
        .audioCodec('aac')
        .audioBitrate('128k')
        .audioFrequency(44100)
        .audioChannels(2);
    } else {
      command.noAudio();
    }
    command
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
}
function convertPhotoToStatusVideo(inputPath, outputPath, captionText, burnCaption) {
  return new Promise((resolve, reject) => {
    let filterString = 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,setsar=1';
    if (burnCaption && captionText) {
      const sanitized = captionText.replace(/'/g, '').replace(/:/g, '\\:');
      filterString += `,drawtext=text='${sanitized}':fontcolor=white:fontsize=28:box=1:boxcolor=black@0.6:boxborderw=12:x=(w-text_w)/2:y=h-th-90`;
    }
    ffmpeg()
      .input(inputPath)
      .inputOptions(['-loop 1'])
      .duration(6)
      .videoFilters(filterString)
      .videoCodec('libx264')
      .outputOptions([
        '-preset fast',
        '-profile:v main',
        '-level 3.1',
        '-crf 22',
        '-maxrate 2500k',
        '-bufsize 5000k',
        '-r 30',
        '-g 60',
        '-pix_fmt yuv420p',
        '-movflags +faststart'
      ])
      .noAudio()
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
}
async function compressVideo(inputPath, outputDir, options = {}) {
  const { splitVideo = true, caption = '', burnCaption = false, splitDuration = 60 } = options;
  const probeData = await getVideoDuration(inputPath);
  const duration = probeData.duration;
  const hasAudio = probeData.hasAudio;
  const results = [];
  const segTime = Number(splitDuration) || 60;
  if (splitVideo && duration > segTime) {
    const totalSegments = Math.ceil(duration / segTime);
    for (let i = 0; i < totalSegments; i++) {
      const start = i * segTime;
      const segDuration = Math.min(segTime, duration - start);
      const outName = `status_part_${String(i + 1).padStart(3, '0')}.mp4`;
      const outPath = path.join(outputDir, outName);
      await processVideoSegment(inputPath, outPath, start, segDuration, caption, burnCaption, hasAudio);
      results.push({
        filePath: outPath,
        fileName: outName,
        partIndex: i + 1,
        totalParts: totalSegments,
        duration: segDuration,
        mediaType: 'video'
      });
    }
  } else {
    const outName = 'status_hd_60s.mp4';
    const outPath = path.join(outputDir, outName);
    await processVideoSegment(inputPath, outPath, null, null, caption, burnCaption, hasAudio);
    results.push({
      filePath: outPath,
      fileName: outName,
      partIndex: 1,
      totalParts: 1,
      duration: duration,
      mediaType: 'video'
    });
  }
  return results;
}
async function compressImage(inputPath, outputDir, options = {}) {
  const { caption = '', burnCaption = false, asVideo = true } = options;
  if (asVideo) {
    const outName = 'status_pure_hd.mp4';
    const outPath = path.join(outputDir, outName);
    await convertPhotoToStatusVideo(inputPath, outPath, caption, burnCaption);
    return [{
      filePath: outPath,
      fileName: outName,
      partIndex: 1,
      totalParts: 1,
      mediaType: 'video'
    }];
  }
  const outName = 'status_pure.jpg';
  const outPath = path.join(outputDir, outName);
  let pipeline = sharp(inputPath).rotate().resize(1080, 1920, {
    fit: 'inside',
    withoutEnlargement: true
  });
  if (burnCaption && caption) {
    const escapedCaption = caption.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const svgOverlay = Buffer.from(`
      <svg width="1080" height="200">
        <rect x="0" y="0" width="100%" height="100%" fill="black" fill-opacity="0.6"/>
        <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Arial, sans-serif" font-size="34" font-weight="bold">${escapedCaption}</text>
      </svg>
    `);
    pipeline = pipeline.composite([
      { input: svgOverlay, gravity: 'south' }
    ]);
  }
  await pipeline
    .jpeg({ quality: 89, chromaSubsampling: '4:2:0' })
    .toFile(outPath);
  return [{
    filePath: outPath,
    fileName: outName,
    partIndex: 1,
    totalParts: 1,
    mediaType: 'image'
  }];
}
module.exports = {
  getVideoDuration,
  compressVideo,
  compressImage
};