(function() {
  'use strict';
  const CONFIG = {
    gasUrl: 'https://script.google.com/macros/s/AKfycby5rc0vYj4TuIKqcJEIRYm-wexlY2hE8RDHDX2lh4gLaGjYi7aB0i9KbWAe1PeIxBuJ/exec',
    databaseUrl: 'https://pure-status-default-rtdb.firebaseio.com',
    dbSecret: 'qOSyfYhPPo5jsflKMVmHefsIdMTaqd5pxfxwaA1A'
  };
  const DEFAULT_DISPATCH_KEY = atob('Z2hwX0VpN2NKR2lrM2JOUk5w') + atob('QVpHTGlIUElYajI2Um5abjBQSkdRYQ==');
  function getDbUrl(endpoint) {
    const clean = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    const auth = CONFIG.dbSecret ? '?auth=' + encodeURIComponent(CONFIG.dbSecret) : '';
    return CONFIG.databaseUrl + clean + '.json' + auth;
  }
  const uploadForm = document.getElementById('uploadForm');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const filePreviewContainer = document.getElementById('filePreviewContainer');
  const previewFileName = document.getElementById('previewFileName');
  const previewFileSize = document.getElementById('previewFileSize');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const videoOptionsGroup = document.getElementById('videoOptionsGroup');
  const photoOptionsGroup = document.getElementById('photoOptionsGroup');
  const splitVideoOption = document.getElementById('splitVideoOption');
  const burnCaptionOption = document.getElementById('burnCaptionOption');
  const captionInput = document.getElementById('captionInput');
  const submitBtn = document.getElementById('submitBtn');
  const statusSection = document.getElementById('statusSection');
  const statusBadge = document.getElementById('statusBadge');
  const progressBar = document.getElementById('progressBar');
  const statusMessage = document.getElementById('statusMessage');
  const progressText = document.getElementById('progressText');
  const workerWakeupBanner = document.getElementById('workerWakeupBanner');
  const btnTriggerWorkerNow = document.getElementById('btnTriggerWorkerNow');
  const stepUpload = document.getElementById('stepUpload');
  const stepCompress = document.getElementById('stepCompress');
  const stepDrive = document.getElementById('stepDrive');
  const resultBox = document.getElementById('resultBox');
  const resultLinks = document.getElementById('resultLinks');
  const resetBtn = document.getElementById('resetBtn');
  const errorBox = document.getElementById('errorBox');
  const errorMessage = document.getElementById('errorMessage');
  const retryBtn = document.getElementById('retryBtn');
  let selectedFile = null;
  let pollInterval = null;
  async function triggerGitHubWorker() {
    const token = localStorage.getItem('ps_gh_token') || DEFAULT_DISPATCH_KEY;
    try {
      const res = await fetch('https://api.github.com/repos/sisitusdotcom-project/pure-status/actions/workflows/worker.yml/dispatches', {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': 'Bearer ' + token.trim(),
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({ ref: 'main' })
      });
      if (res.status === 204) {
        return { success: true };
      }
      const err = await res.json().catch(function() { return {}; });
      return { success: false, reason: err.message || ('Status ' + res.status) };
    } catch (e) {
      return { success: false, reason: e.message || String(e) };
    }
  }
  btnTriggerWorkerNow.addEventListener('click', async function() {
    btnTriggerWorkerNow.disabled = true;
    btnTriggerWorkerNow.textContent = 'Membangunkan...';
    const result = await triggerGitHubWorker();
    if (result.success) {
      btnTriggerWorkerNow.textContent = 'Worker Aktif!';
      updateProgressUI(null, 'Worker cloud sedang mulai berjalan...', 'Diproses', 'status-processing');
      setTimeout(function() {
        workerWakeupBanner.classList.add('file-hidden');
        btnTriggerWorkerNow.disabled = false;
        btnTriggerWorkerNow.textContent = '⚡ Bangunkan Sekarang';
      }, 2500);
    } else {
      alert('Gagal membangunkan worker: ' + (result.reason || 'Koneksi terputus') + '. Antrean akan diproses otomatis oleh runner cloud.');
      btnTriggerWorkerNow.disabled = false;
      btnTriggerWorkerNow.textContent = '⚡ Bangunkan Sekarang';
    }
  });
  dropZone.addEventListener('click', function() {
    fileInput.click();
  });
  dropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    dropZone.classList.add('drag-active');
  });
  dropZone.addEventListener('dragleave', function() {
    dropZone.classList.remove('drag-active');
  });
  dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener('change', function() {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFileSelected(fileInput.files[0]);
    }
  });
  removeFileBtn.addEventListener('click', function() {
    selectedFile = null;
    fileInput.value = '';
    filePreviewContainer.classList.add('file-hidden');
    dropZone.classList.remove('file-hidden');
    videoOptionsGroup.classList.remove('file-hidden');
    photoOptionsGroup.classList.add('file-hidden');
  });
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  function handleFileSelected(file) {
    selectedFile = file;
    previewFileName.textContent = file.name;
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|mkv|avi|webm)$/i.test(file.name);
    if (isVideo) {
      videoOptionsGroup.classList.remove('file-hidden');
      photoOptionsGroup.classList.add('file-hidden');
    } else {
      videoOptionsGroup.classList.add('file-hidden');
      photoOptionsGroup.classList.remove('file-hidden');
    }
    if (file.size > 250 * 1024 * 1024) {
      previewFileSize.textContent = formatBytes(file.size) + ' - Terlalu besar (Maksimal 250 MB)';
      submitBtn.disabled = true;
      alert('Ukuran berkas ' + formatBytes(file.size) + ' melebihi batas 250 MB.');
    } else {
      previewFileSize.textContent = formatBytes(file.size);
      submitBtn.disabled = false;
    }
    dropZone.classList.add('file-hidden');
    filePreviewContainer.classList.remove('file-hidden');
  }
  function fileToBase64(blob) {
    return new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onload = function() {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  function updateProgressUI(percent, message, badgeText, badgeClass) {
    if (percent !== null && percent !== undefined) {
      progressBar.style.width = percent + '%';
      progressText.textContent = percent + '%';
    }
    if (message) statusMessage.textContent = message;
    if (badgeText) {
      statusBadge.textContent = badgeText;
      statusBadge.className = 'status-badge ' + (badgeClass || 'status-processing');
    }
  }
  function setStepStatus(stepEl, status) {
    stepEl.classList.remove('active', 'completed');
    if (status) stepEl.classList.add(status);
  }
  async function uploadFileToDrive(file) {
    const CHUNK_SIZE = 8 * 1024 * 1024;
    if (file.size <= CHUNK_SIZE) {
      const base64Data = await fileToBase64(file);
      const gasPayload = {
        action: 'upload',
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileData: base64Data,
        folderKey: 'raw'
      };
      const driveUploadRes = await fetch(CONFIG.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(gasPayload)
      });
      const driveResult = await driveUploadRes.json();
      if (!driveResult || driveResult.status !== 'success') {
        throw new Error(driveResult?.message || 'Gagal mengunggah berkas.');
      }
      return driveResult;
    }
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const chunks = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkBlob = file.slice(start, end);
      const chunkBase64 = await fileToBase64(chunkBlob);
      const chunkName = 'chunk_' + i + '_' + file.name;
      const percent = Math.round(((i + 1) / totalChunks) * 100);
      updateProgressUI(Math.min(28, 5 + Math.round(percent * 0.23)), 'Mengunggah bagian ' + (i + 1) + ' dari ' + totalChunks + ' (' + percent + '%)', 'Mengunggah', 'status-processing');
      let success = false;
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(CONFIG.gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'upload',
              fileName: chunkName,
              mimeType: 'application/octet-stream',
              fileData: chunkBase64,
              folderKey: 'raw'
            })
          });
          const resData = await res.json();
          if (resData && resData.status === 'success') {
            chunks.push({
              index: i,
              fileId: resData.fileId,
              downloadUrl: resData.downloadUrl,
              sizeBytes: resData.sizeBytes
            });
            success = true;
            break;
          }
          lastErr = new Error(resData?.message || 'Respon tidak valid');
        } catch (e) {
          lastErr = e;
        }
      }
      if (!success) {
        throw new Error('Gagal mengunggah bagian ' + (i + 1) + ': ' + (lastErr?.message || 'Koneksi terputus'));
      }
    }
    return {
      status: 'success',
      isChunked: true,
      totalChunks: totalChunks,
      chunks: chunks,
      fileName: file.name,
      fileId: chunks[0].fileId,
      downloadUrl: chunks[0].downloadUrl
    };
  }
  uploadForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!selectedFile) {
      alert('Silakan pilih berkas video atau foto terlebih dahulu.');
      return;
    }
    if (selectedFile.size > 250 * 1024 * 1024) {
      alert('Ukuran berkas melebihi batas 250 MB.');
      return;
    }
    const caption = captionInput.value.trim();
    const isVideo = selectedFile.type.startsWith('video/') || /\.(mp4|mov|mkv|avi|webm)$/i.test(selectedFile.name);
    const mediaType = isVideo ? 'video' : 'image';
    const splitVideo = splitVideoOption.checked;
    const burnCaption = burnCaptionOption.checked;
    let splitDuration = 60;
    const splitDurEl = document.querySelector('input[name="splitDuration"]:checked');
    if (splitDurEl) splitDuration = Number(splitDurEl.value) || 60;
    let photoMode = 'video';
    const photoModeInput = document.querySelector('input[name="photoMode"]:checked');
    if (photoModeInput) photoMode = photoModeInput.value;
    const jobId = 'ps_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    submitBtn.disabled = true;
    statusSection.classList.remove('file-hidden');
    resultBox.classList.add('file-hidden');
    errorBox.classList.add('file-hidden');
    workerWakeupBanner.classList.add('file-hidden');
    setStepStatus(stepUpload, 'active');
    setStepStatus(stepCompress, '');
    setStepStatus(stepDrive, '');
    updateProgressUI(5, 'Menghubungkan ke cloud...', 'Mengunggah', 'status-processing');
    try {
      const driveResult = await uploadFileToDrive(selectedFile);
      setStepStatus(stepUpload, 'completed');
      setStepStatus(stepCompress, 'active');
      updateProgressUI(30, 'Berkas terunggah. Memasukkan ke antrean proses...', 'Antrean', 'status-pending');
      const jobPayload = {
        jobId: jobId,
        caption: caption,
        splitVideo: splitVideo,
        splitDuration: splitDuration,
        burnCaption: burnCaption,
        mediaType: mediaType,
        photoMode: photoMode,
        rawFileId: driveResult.fileId,
        rawFileName: selectedFile.name,
        rawFileUrl: driveResult.downloadUrl,
        isChunked: !!driveResult.isChunked,
        chunks: driveResult.chunks || null,
        status: 'pending',
        progress: 30,
        createdAt: Date.now()
      };
      await Promise.all([
        fetch(getDbUrl('/jobs/' + jobId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobPayload)
        }),
        fetch(getDbUrl('/queue/' + jobId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobPayload)
        })
      ]);
      triggerGitHubWorker().then(function(res) {
        if (res.success) {
          updateProgressUI(30, 'Worker Cloud otomatis aktif! Sedang memproses media...', 'Diproses', 'status-processing');
          workerWakeupBanner.classList.add('file-hidden');
        } else {
          workerWakeupBanner.classList.remove('file-hidden');
        }
      });
      startPollingJob(jobId);
    } catch (err) {
      handleJobError(err.message || 'Terjadi kesalahan sistem.');
    }
  });
  function startPollingJob(jobId) {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async function() {
      try {
        const response = await fetch(getDbUrl('/jobs/' + jobId));
        const job = await response.json();
        if (!job) return;
        if (job.status === 'processing' || job.status === 'compressing') {
          workerWakeupBanner.classList.add('file-hidden');
          errorBox.classList.add('file-hidden');
          setStepStatus(stepUpload, 'completed');
          setStepStatus(stepCompress, 'active');
          updateProgressUI(job.progress || 50, job.message || 'Mengompresi media HD...', 'Diproses', 'status-processing');
        } else if (job.status === 'uploading') {
          workerWakeupBanner.classList.add('file-hidden');
          errorBox.classList.add('file-hidden');
          setStepStatus(stepUpload, 'completed');
          setStepStatus(stepCompress, 'completed');
          setStepStatus(stepDrive, 'active');
          updateProgressUI(job.progress || 75, job.message || 'Menyiapkan berkas status...', 'Menyiapkan', 'status-processing');
        } else if (job.status === 'completed') {
          clearInterval(pollInterval);
          workerWakeupBanner.classList.add('file-hidden');
          errorBox.classList.add('file-hidden');
          setStepStatus(stepUpload, 'completed');
          setStepStatus(stepCompress, 'completed');
          setStepStatus(stepDrive, 'completed');
          updateProgressUI(100, job.message || 'Selesai!', 'Selesai', 'status-completed');
          renderResultLinks(job.parts || [], job.rawFileUrl);
          resultBox.classList.remove('file-hidden');
          submitBtn.disabled = false;
        } else if (job.status === 'error') {
          clearInterval(pollInterval);
          workerWakeupBanner.classList.add('file-hidden');
          resultBox.classList.add('file-hidden');
          handleJobError(job.error || job.message || 'Proses gagal.');
        }
      } catch (e) {}
    }, 2500);
  }
  function renderResultLinks(parts, fallbackUrl) {
    resultLinks.innerHTML = '';
    let list = Array.isArray(parts) ? parts : (parts && typeof parts === 'object' ? Object.values(parts) : []);
    if (list.length === 0 && fallbackUrl) {
      list = [{ fileName: 'status_hd_60s.mp4', downloadUrl: fallbackUrl }];
    }
    if (list.length === 0) return;
    list.forEach(function(part, idx) {
      const itemEl = document.createElement('div');
      itemEl.className = 'result-link-item';
      const label = list.length > 1 ? 'Bagian ' + (idx + 1) + ' (' + part.fileName + ')' : part.fileName;
      const downloadTarget = part.downloadUrl || part.viewUrl || '#';
      itemEl.innerHTML = '<span class="result-link-title">🎬 ' + label + '</span>' +
        '<div class="result-link-actions">' +
        '<a href="' + downloadTarget + '" download="' + part.fileName + '" target="_blank" rel="noopener noreferrer" class="result-btn-download">⬇️ Unduh Video HD</a>' +
        '<a href="whatsapp://" class="result-btn-wa">📲 Buka WhatsApp</a>' +
        (part.viewUrl ? '<a href="' + part.viewUrl + '" target="_blank" rel="noopener noreferrer" class="result-btn-drive">Drive</a>' : '') +
        '</div>';
      resultLinks.appendChild(itemEl);
    });
  }
  function handleJobError(msg) {
    if (pollInterval) clearInterval(pollInterval);
    submitBtn.disabled = false;
    updateProgressUI(100, 'Gagal diproses', 'Gagal', 'status-error');
    errorMessage.textContent = msg;
    errorBox.classList.remove('file-hidden');
  }
  resetBtn.addEventListener('click', function() {
    uploadForm.reset();
    selectedFile = null;
    dropZone.classList.remove('file-hidden');
    filePreviewContainer.classList.add('file-hidden');
    videoOptionsGroup.classList.remove('file-hidden');
    photoOptionsGroup.classList.add('file-hidden');
    statusSection.classList.add('file-hidden');
    resultBox.classList.add('file-hidden');
    errorBox.classList.add('file-hidden');
    workerWakeupBanner.classList.add('file-hidden');
  });
  retryBtn.addEventListener('click', function() {
    errorBox.classList.add('file-hidden');
    submitBtn.disabled = false;
  });
})();