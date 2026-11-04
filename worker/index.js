require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const RTDBService = require('./rtdbService');
const { downloadFileFromDrive, appendChunkFromDrive, uploadToDrive } = require('./driveService');
const { compressVideo, compressImage } = require('./compressor');
const { sendToWhatsApp } = require('./whatsappService');
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://pure-status-default-rtdb.firebaseio.com';
const DATABASE_SECRET = process.env.FIREBASE_DB_SECRET;
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || path.join(process.cwd(), 'serviceAccountKey.json');
const GAS_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
const WA_CONFIG = {
  gatewayUrl: process.env.WA_GATEWAY_URL,
  apiKey: process.env.WA_API_KEY
};
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '3000', 10);
const PORT = parseInt(process.env.PORT || '3000', 10);
const RUN_ONCE = process.env.RUN_ONCE === 'true';
const TMP_DIR = path.join(__dirname, 'tmp');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}
const rtdb = new RTDBService(DATABASE_URL, DATABASE_SECRET, SERVICE_ACCOUNT_PATH);
let isProcessing = false;
async function cleanDirectory(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const curPath = path.join(dirPath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          cleanDirectory(curPath);
          fs.rmdirSync(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      }
    }
  } catch (err) {}
}
async function processJob(jobId, jobData) {
  const jobTmpDir = path.join(TMP_DIR, jobId);
  if (!fs.existsSync(jobTmpDir)) {
    fs.mkdirSync(jobTmpDir, { recursive: true });
  }
  try {
    await rtdb.updateJob(jobId, {
      status: 'processing',
      progress: 10,
      message: 'Mengunduh file dari Google Drive...'
    });
    const rawExt = path.extname(jobData.rawFileName || '').toLowerCase() || (jobData.mediaType === 'video' ? '.mp4' : '.jpg');
    const rawFilePath = path.join(jobTmpDir, `raw_${jobId}${rawExt}`);
    if (jobData.isChunked && Array.isArray(jobData.chunks) && jobData.chunks.length > 0) {
      const sortedChunks = jobData.chunks.slice().sort((a, b) => (a.index || 0) - (b.index || 0));
      const writer = fs.createWriteStream(rawFilePath);
      for (let c = 0; c < sortedChunks.length; c++) {
        await appendChunkFromDrive(sortedChunks[c].downloadUrl, writer);
      }
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
        writer.end();
      });
    } else {
      await downloadFileFromDrive(jobData.rawFileUrl, rawFilePath);
    }
    await rtdb.updateJob(jobId, {
      status: 'compressing',
      progress: 35,
      message: 'Menerapkan kompresi Pure Status...'
    });
    const outputDir = path.join(jobTmpDir, 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    let processedFiles = [];
    if (jobData.mediaType === 'video') {
      processedFiles = await compressVideo(rawFilePath, outputDir, {
        splitVideo: jobData.splitVideo !== false,
        splitDuration: jobData.splitDuration || 60,
        caption: jobData.caption || '',
        burnCaption: !!jobData.burnCaption
      });
    } else {
      processedFiles = await compressImage(rawFilePath, outputDir, {
        caption: jobData.caption || '',
        burnCaption: !!jobData.burnCaption,
        asVideo: jobData.photoMode !== 'image'
      });
    }
    await rtdb.updateJob(jobId, {
      status: 'uploading',
      progress: 70,
      message: 'Menyimpan hasil ke Google Drive...'
    });
    const uploadedParts = [];
    if (GAS_URL && !GAS_URL.includes('MASUKKAN_ID')) {
      for (const item of processedFiles) {
        const driveRes = await uploadToDrive(GAS_URL, item.filePath, 'compressed');
        uploadedParts.push({
          partIndex: item.partIndex,
          totalParts: item.totalParts,
          fileName: item.fileName,
          fileId: driveRes.fileId,
          downloadUrl: driveRes.downloadUrl,
          viewUrl: driveRes.viewUrl
        });
      }
    } else {
      processedFiles.forEach((item) => {
        uploadedParts.push({
          partIndex: item.partIndex,
          totalParts: item.totalParts,
          fileName: item.fileName,
          fileId: '',
          downloadUrl: '',
          viewUrl: ''
        });
      });
    }
    if (WA_CONFIG.gatewayUrl && !WA_CONFIG.gatewayUrl.includes('TOKEN')) {
      await rtdb.updateJob(jobId, {
        status: 'sending',
        progress: 85,
        message: 'Mengirimkan media ke WhatsApp tujuan...'
      });
      await sendToWhatsApp(WA_CONFIG, jobData.phoneNumber, processedFiles, jobData.caption || '');
    }
    await rtdb.updateJob(jobId, {
      status: 'completed',
      progress: 100,
      parts: uploadedParts,
      message: 'Berhasil dikompresi sesuai standar Pure Status.'
    });
    await rtdb.removeQueueItem(jobId);
  } catch (error) {
    await rtdb.updateJob(jobId, {
      status: 'error',
      error: error.message || String(error),
      message: 'Gagal memproses media: ' + (error.message || String(error))
    });
    await rtdb.removeQueueItem(jobId);
  } finally {
    cleanDirectory(jobTmpDir);
    try {
      if (fs.existsSync(jobTmpDir)) fs.rmdirSync(jobTmpDir);
    } catch (e) {}
  }
}
async function pollQueue() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    let queue = await rtdb.getQueue();
    let jobIds = queue && typeof queue === 'object' ? Object.keys(queue) : [];
    if (jobIds.length === 0) {
      const allJobs = await rtdb.getAllJobs();
      if (allJobs && typeof allJobs === 'object') {
        jobIds = Object.keys(allJobs).filter(id => allJobs[id] && allJobs[id].status === 'pending');
        queue = allJobs;
      }
    }
    if (jobIds.length > 0) {
      const currentJobId = jobIds[0];
      const currentJob = queue[currentJobId];
      await processJob(currentJobId, currentJob);
    }
  } catch (err) {
  } finally {
    isProcessing = false;
  }
}
async function runSingleBatch() {
  try {
    let queue = await rtdb.getQueue();
    let jobIds = queue && typeof queue === 'object' ? Object.keys(queue) : [];
    if (jobIds.length === 0) {
      const allJobs = await rtdb.getAllJobs();
      if (allJobs && typeof allJobs === 'object') {
        jobIds = Object.keys(allJobs).filter(id => allJobs[id] && allJobs[id].status === 'pending');
        queue = allJobs;
      }
    }
    for (let i = 0; i < jobIds.length; i++) {
      const currentJobId = jobIds[i];
      const currentJob = queue[currentJobId];
      await processJob(currentJobId, currentJob);
    }
  } catch (err) {}
  process.exit(0);
}
const mimeMap = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};
function sendJsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  if (pathname === '/api/jobs' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const jobData = JSON.parse(body);
        if (!jobData.jobId) {
          sendJsonResponse(res, 400, { status: 'error', message: 'jobId wajib disertakan' });
          return;
        }
        await rtdb.createJob(jobData.jobId, jobData);
        sendJsonResponse(res, 200, { status: 'success', jobId: jobData.jobId });
      } catch (err) {
        sendJsonResponse(res, 500, { status: 'error', message: err.message });
      }
    });
    return;
  }
  if (pathname.startsWith('/api/jobs/') && req.method === 'GET') {
    const jobId = pathname.replace('/api/jobs/', '');
    rtdb.getJob(jobId)
      .then(data => {
        if (!data) return sendJsonResponse(res, 404, { status: 'error', message: 'Pekerjaan tidak ditemukan' });
        sendJsonResponse(res, 200, data);
      })
      .catch(err => sendJsonResponse(res, 500, { status: 'error', message: err.message }));
    return;
  }
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
});
if (RUN_ONCE) {
  runSingleBatch();
} else {
  server.listen(PORT, () => {
    process.stdout.write(`WhatsApp Pure Status Worker & Web berjalan di port ${PORT}\n`);
  });
  setInterval(pollQueue, POLL_INTERVAL_MS);
  pollQueue();
}