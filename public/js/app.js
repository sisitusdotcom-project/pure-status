(function() {
  'use strict';
  const CONFIG = {
    gasUrl: 'https://script.google.com/macros/s/AKfycbxe9zt4vCzW5XYA0NrADf0u4KHY8SZ5o8-T7RkGgH1zOuJXQ23BIAqldwrz8wfeuPOA/exec',
    databaseUrl: 'https://pure-status-default-rtdb.firebaseio.com'
  };
  const uploadForm = document.getElementById('uploadForm');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const filePreviewContainer = document.getElementById('filePreviewContainer');
  const previewFileName = document.getElementById('previewFileName');
  const previewFileSize = document.getElementById('previewFileSize');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const phoneNumberInput = document.getElementById('phoneNumber');
  const captionInput = document.getElementById('captionInput');
  const splitVideoOption = document.getElementById('splitVideoOption');
  const burnCaptionOption = document.getElementById('burnCaptionOption');
  const submitBtn = document.getElementById('submitBtn');
  const statusSection = document.getElementById('statusSection');
  const statusBadge = document.getElementById('statusBadge');
  const progressBar = document.getElementById('progressBar');
  const statusMessage = document.getElementById('statusMessage');
  const progressText = document.getElementById('progressText');
  const stepUpload = document.getElementById('stepUpload');
  const stepCompress = document.getElementById('stepCompress');
  const stepDrive = document.getElementById('stepDrive');
  const stepSend = document.getElementById('stepSend');
  const resultBox = document.getElementById('resultBox');
  const resultLinks = document.getElementById('resultLinks');
  const resetBtn = document.getElementById('resetBtn');
  const errorBox = document.getElementById('errorBox');
  const errorMessage = document.getElementById('errorMessage');
  const retryBtn = document.getElementById('retryBtn');
  let selectedFile = null;
  let pollInterval = null;
  const isServerHosted = window.location.protocol.startsWith('http') && (window.location.port || window.location.hostname !== '');
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
    previewFileSize.textContent = formatBytes(file.size);
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
  function formatPhoneNumber(num) {
    let clean = String(num).replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.substring(1);
    } else if (!clean.startsWith('62')) {
      clean = '62' + clean;
    }
    return clean;
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
  uploadForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!selectedFile) {
      alert('Silakan pilih berkas video atau gambar terlebih dahulu.');
      return;
    }
    const phone = formatPhoneNumber(phoneNumberInput.value);
    const caption = captionInput.value.trim();
    const splitVideo = splitVideoOption.checked;
    const burnCaption = burnCaptionOption.checked;
    const isVideo = selectedFile.type.startsWith('video/') || /\.(mp4|mov|mkv|avi|webm)$/i.test(selectedFile.name);
    const mediaType = isVideo ? 'video' : 'image';
    const jobId = 'ps_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    submitBtn.disabled = true;
    statusSection.classList.remove('file-hidden');
    resultBox.classList.add('file-hidden');
    errorBox.classList.add('file-hidden');
    setStepStatus(stepUpload, 'active');
    setStepStatus(stepCompress, '');
    setStepStatus(stepDrive, '');
    setStepStatus(stepSend, '');
    updateProgressUI(5, 'Mempersiapkan pengunggahan...', 'Mengunggah', 'status-processing');
    try {
      const base64Data = await fileToBase64(selectedFile);
      updateProgressUI(15, 'Mengunggah ke Google Drive...', 'Mengunggah', 'status-processing');
      const gasPayload = {
        action: 'upload',
        fileName: selectedFile.name,
        mimeType: selectedFile.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
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
        throw new Error(driveResult?.message || 'Gagal mengunggah berkas ke Google Drive.');
      }
      setStepStatus(stepUpload, 'completed');
      setStepStatus(stepCompress, 'active');
      updateProgressUI(30, 'Berkas terunggah. Memasukkan ke antrean proses...', 'Antrean', 'status-pending');
      const jobPayload = {
        jobId: jobId,
        phoneNumber: phone,
        caption: caption,
        splitVideo: splitVideo,
        burnCaption: burnCaption,
        mediaType: mediaType,
        rawFileId: driveResult.fileId,
        rawFileName: driveResult.fileName,
        rawFileUrl: driveResult.downloadUrl,
        status: 'pending',
        progress: 30,
        createdAt: Date.now()
      };
      let submitted = false;
      if (isServerHosted) {
        try {
          const apiRes = await fetch('/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jobPayload)
          });
          if (apiRes.ok) submitted = true;
        } catch (apiErr) {}
      }
      if (!submitted) {
        await fetch(CONFIG.databaseUrl + '/jobs/' + jobId + '.json', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobPayload)
        });
        await fetch(CONFIG.databaseUrl + '/queue/' + jobId + '.json', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobPayload)
        });
      }
      startPollingJob(jobId);
    } catch (err) {
      handleJobError(err.message || 'Terjadi kesalahan sistem.');
    }
  });
  function startPollingJob(jobId) {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async function() {
      try {
        let job = null;
        if (isServerHosted) {
          try {
            const apiRes = await fetch('/api/jobs/' + jobId);
            if (apiRes.ok) job = await apiRes.json();
          } catch (e) {}
        }
        if (!job) {
          const response = await fetch(CONFIG.databaseUrl + '/jobs/' + jobId + '.json');
          job = await response.json();
        }
        if (!job) return;
        if (job.status === 'processing' || job.status === 'compressing') {
          setStepStatus(stepUpload, 'completed');
          setStepStatus(stepCompress, 'active');
          updateProgressUI(job.progress || 50, job.message || 'Mengompresi media...', 'Diproses', 'status-processing');
        } else if (job.status === 'uploading') {
          setStepStatus(stepUpload, 'completed');
          setStepStatus(stepCompress, 'completed');
          setStepStatus(stepDrive, 'active');
          updateProgressUI(job.progress || 75, job.message || 'Menyimpan hasil ke Drive...', 'Menyimpan', 'status-processing');
        } else if (job.status === 'sending') {
          setStepStatus(stepUpload, 'completed');
          setStepStatus(stepCompress, 'completed');
          setStepStatus(stepDrive, 'completed');
          setStepStatus(stepSend, 'active');
          updateProgressUI(job.progress || 90, job.message || 'Mengirim ke WhatsApp...', 'Mengirim', 'status-processing');
        } else if (job.status === 'completed') {
          clearInterval(pollInterval);
          setStepStatus(stepUpload, 'completed');
          setStepStatus(stepCompress, 'completed');
          setStepStatus(stepDrive, 'completed');
          setStepStatus(stepSend, 'completed');
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
  function renderResultLinks(parts) {
    resultLinks.innerHTML = '';
    if (!parts || parts.length === 0) return;
    parts.forEach(function(part, idx) {
      const itemEl = document.createElement('div');
      itemEl.className = 'result-link-item';
      const label = parts.length > 1 ? 'Part ' + (idx + 1) + ' (' + part.fileName + ')' : part.fileName;
      itemEl.innerHTML = '<span class="result-link-title">' + label + '</span>' +
        '<div class="result-link-actions">' +
        (part.viewUrl ? '<a href="' + part.viewUrl + '" target="_blank" rel="noopener noreferrer" class="result-btn">Lihat</a>' : '') +
        (part.downloadUrl ? '<a href="' + part.downloadUrl + '" target="_blank" rel="noopener noreferrer" class="result-btn">Unduh</a>' : '') +
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
    statusSection.classList.add('file-hidden');
    resultBox.classList.add('file-hidden');
    errorBox.classList.add('file-hidden');
  });
  retryBtn.addEventListener('click', function() {
    errorBox.classList.add('file-hidden');
    submitBtn.disabled = false;
  });
})();