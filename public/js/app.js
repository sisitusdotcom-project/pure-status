(function() {
  'use strict';
  const CONFIG = {
    gasUrl: 'https://script.google.com/macros/s/AKfycby5rc0vYj4TuIKqcJEIRYm-wexlY2hE8RDHDX2lh4gLaGjYi7aB0i9KbWAe1PeIxBuJ/exec',
    databaseUrl: 'https://pure-status-default-rtdb.firebaseio.com',
    dbSecret: 'qOSyfYhPPo5jsflKMVmHefsIdMTaqd5pxfxwaA1A'
  };
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
  function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onload = function() {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function updateProgressUI(percent, message, badgeText, badgeClass) {
    progressBar.style.width = percent + '%';
    progressText.textContent = percent + '%';
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
  async function uploadResumable(sessionUrl, file) {
    const CHUNK_SIZE = 5 * 1024 * 1024;
    let start = 0;
    while (start < file.size) {
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const contentRange = 'bytes ' + start + '-' + (end - 1) + '/' + file.size;
      const percent = Math.round((start / file.size) * 100);
      updateProgressUI(Math.min(28, 5 + Math.round(percent * 0.23)), 'Mengunggah: ' + formatBytes(start) + ' / ' + formatBytes(file.size) + ' (' + percent + '%)', 'Mengunggah', 'status-processing');
      const res = await fetch(sessionUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': contentRange
        },
        body: chunk
      });
      if (res.status === 200 || res.status === 201) {
        const driveData = await res.json();
        const fileId = driveData.id;
        return {
          status: 'success',
          fileId: fileId,
          fileName: file.name,
          downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fileId,
          viewUrl: 'https://drive.google.com/file/d/' + fileId + '/view'
        };
      }
      if (res.status === 308) {
        start = end;
      } else {
        throw new Error('Gagal mengunggah potongan file (' + res.status + ')');
      }
    }
  }
  async function uploadFileToDrive(file) {
    if (file.size > 20 * 1024 * 1024) {
      try {
        const sessionPayload = {
          action: 'createSession',
          fileName: file.name,
          mimeType: file.type || 'video/mp4',
          fileSize: file.size,
          folderKey: 'raw'
        };
        const sessionRes = await fetch(CONFIG.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(sessionPayload)
        });
        const sessionData = await sessionRes.json();
        if (sessionData && sessionData.status === 'success' && sessionData.sessionUrl) {
          return await uploadResumable(sessionData.sessionUrl, file);
        }
      } catch (err) {}
    }
    const base64Data = await fileToBase64(file);
    const gasPayload = {
      action: 'upload',
      fileName: file.name,
      mimeType: file.type || 'video/mp4',
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
    setStepStatus(stepUpload, 'active');
    setStepStatus(stepCompress, '');
    setStepStatus(stepDrive, '');
    updateProgressUI(5, 'Menghubungkan ke penyimpanan cloud...', 'Mengunggah', 'status-processing');
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
        rawFileName: driveResult.fileName,
        rawFileUrl: driveResult.downloadUrl,
        status: 'pending',
        progress: 30,
        createdAt: Date.now()
      };
      await fetch(getDbUrl('/jobs/' + jobId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobPayload)
      });
      await fetch(getDbUrl('/queue/' + jobId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobPayload)
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
          setStepStatus(stepUpload, 'completed');
          setStepStatus(stepCompress, 'active');
          updateProgressUI(job.progress || 50, job.message || 'Mengompresi media HD...', 'Diproses', 'status-processing');
        } else if (job.status === 'uploading') {
          setStepStatus(stepUpload, 'completed');
          setStepStatus(stepCompress, 'completed');
          setStepStatus(stepDrive, 'active');
          updateProgressUI(job.progress || 75, job.message || 'Menyiapkan berkas status...', 'Menyiapkan', 'status-processing');
        } else if (job.status === 'completed') {
          clearInterval(pollInterval);
          setStepStatus(stepUpload, 'completed');
          setStepStatus(stepCompress, 'completed');
          setStepStatus(stepDrive, 'completed');
          updateProgressUI(100, job.message || 'Selesai!', 'Selesai', 'status-completed');
          renderResultLinks(job.parts || []);
          resultBox.classList.remove('file-hidden');
          submitBtn.disabled = false;
        } else if (job.status === 'error') {
          clearInterval(pollInterval);
          handleJobError(job.error || job.message || 'Proses gagal.');
        }
      } catch (e) {}
    }, 2500);
  }
  async function shareFileToWhatsApp(url, fileName) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: blob.type || 'video/mp4' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'WhatsApp Status HD',
          text: 'Status HD PureStatus',
          files: [file]
        });
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        alert('Berkas sedang diunduh ke galeri. Buka WhatsApp > Status Saya, lalu pilih berkas ini.');
      }
    } catch (e) {
      window.open(url, '_blank');
    }
  }
  function renderResultLinks(parts) {
    resultLinks.innerHTML = '';
    if (!parts || parts.length === 0) return;
    parts.forEach(function(part, idx) {
      const itemEl = document.createElement('div');
      itemEl.className = 'result-link-item';
      const label = parts.length > 1 ? 'Part ' + (idx + 1) + ' (' + part.fileName + ')' : part.fileName;
      const downloadTarget = part.downloadUrl || part.viewUrl || '#';
      itemEl.innerHTML = '<span class="result-link-title">🎬 ' + label + '</span>' +
        '<div class="result-link-actions">' +
        '<button type="button" class="btn-share-wa result-btn" data-url="' + downloadTarget + '" data-name="' + part.fileName + '">📲 Bagikan ke WhatsApp</button>' +
        '<a href="' + downloadTarget + '" download="' + part.fileName + '" target="_blank" rel="noopener noreferrer" class="result-btn-download">Unduh</a>' +
        (part.viewUrl ? '<a href="' + part.viewUrl + '" target="_blank" rel="noopener noreferrer" class="result-btn">Drive</a>' : '') +
        '</div>';
      resultLinks.appendChild(itemEl);
    });
    const shareBtns = resultLinks.querySelectorAll('.btn-share-wa');
    shareBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        const u = btn.getAttribute('data-url');
        const n = btn.getAttribute('data-name');
        shareFileToWhatsApp(u, n);
      });
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
  });
  retryBtn.addEventListener('click', function() {
    errorBox.classList.add('file-hidden');
    submitBtn.disabled = false;
  });
})();