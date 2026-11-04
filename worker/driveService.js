const fs = require('fs');
const path = require('path');
const axios = require('axios');
function extractDriveFileId(url) {
  const matchId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId) return matchId[1];
  const matchFileD = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFileD) return matchFileD[1];
  return null;
}
async function downloadFileFromDrive(fileUrl, outputPath) {
  const fileId = extractDriveFileId(fileUrl);
  let targetUrl = fileUrl;
  if (fileId) {
    targetUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
  }
  const response = await axios({
    method: 'GET',
    url: targetUrl,
    responseType: 'stream',
    maxRedirects: 10,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(outputPath));
    writer.on('error', reject);
  });
}
async function uploadToDrive(gasUrl, filePath, folderKey = 'compressed') {
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  let mimeType = 'application/octet-stream';
  if (ext === '.mp4') mimeType = 'video/mp4';
  if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
  if (ext === '.png') mimeType = 'image/png';
  if (ext === '.webp') mimeType = 'image/webp';
  const payload = {
    action: 'upload',
    fileName: fileName,
    mimeType: mimeType,
    fileData: base64Data,
    folderKey: folderKey
  };
  const response = await axios.post(gasUrl, payload, {
    headers: { 'Content-Type': 'application/json' },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });
  if (response.data && response.data.status === 'success') {
    return response.data;
  }
  throw new Error(response.data?.message || 'Gagal mengunggah file ke Google Drive');
}
module.exports = {
  extractDriveFileId,
  downloadFileFromDrive,
  uploadToDrive
};