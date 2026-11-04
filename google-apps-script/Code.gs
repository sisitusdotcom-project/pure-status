const DRIVE_FOLDERS = {
  raw: '1wA4TD4iOuH5JyNuNK3fR3tzsbIfKn5Vf',
  compressed: '1wA4TD4iOuH5JyNuNK3fR3tzsbIfKn5Vf',
  default: '1wA4TD4iOuH5JyNuNK3fR3tzsbIfKn5Vf'
};
function normalizeParam(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.length ? String(value[0]) : '';
  return String(value);
}
function doGet(e) {
  return jsonResponse({ status: 'ok', service: 'Unblur WhatsApp Status Storage' }, 200);
}
function doPost(e) {
  try {
    let params = {};
    if (e && e.postData && e.postData.contents) {
      try {
        params = JSON.parse(e.postData.contents);
      } catch (err) {
        params = e.parameter || {};
      }
    } else if (e && e.parameter) {
      params = e.parameter;
    }
    const action = normalizeParam(params.action || 'upload');
    if (action === 'createSession') {
      return createUploadSession(params);
    }
    if (action === 'upload') {
      return uploadToDrive(params);
    }
    return jsonResponse({ status: 'error', message: 'Aksi tidak valid' }, 400);
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() }, 500);
  }
}
function createUploadSession(params) {
  const fileName = normalizeParam(params.fileName);
  const mimeType = normalizeParam(params.mimeType) || 'application/octet-stream';
  const fileSize = Number(params.fileSize || 0);
  const folderKey = normalizeParam(params.folderKey || 'raw');
  const folderId = normalizeParam(params.folderId) || DRIVE_FOLDERS[folderKey] || DRIVE_FOLDERS.default;
  if (!fileName || !fileSize) {
    return jsonResponse({ status: 'error', message: 'fileName dan fileSize wajib disertakan' }, 400);
  }
  const token = ScriptApp.getOAuthToken();
  const metadata = {
    name: fileName,
    mimeType: mimeType,
    parents: [folderId]
  };
  const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(fileSize)
    },
    payload: JSON.stringify(metadata),
    muteHttpExceptions: true
  });
  const headers = response.getAllHeaders();
  const sessionUrl = headers['Location'] || headers['location'];
  if (sessionUrl) {
    return jsonResponse({ status: 'success', sessionUrl: sessionUrl, folderId: folderId }, 200);
  }
  return jsonResponse({ status: 'error', message: 'Gagal membuat sesi upload Drive: ' + response.getContentText() }, 500);
}
function uploadToDrive(data) {
  const fileName = normalizeParam(data.fileName);
  const mimeType = normalizeParam(data.mimeType);
  let base64Data = normalizeParam(data.fileData) || '';
  if (base64Data.includes('base64,')) {
    base64Data = base64Data.split('base64,')[1];
  }
  const folderKey = normalizeParam(data.folderKey || 'raw');
  const folderId = normalizeParam(data.folderId) || DRIVE_FOLDERS[folderKey] || DRIVE_FOLDERS.default;
  if (!fileName || !mimeType || !base64Data) {
    return jsonResponse({ status: 'error', message: 'Data file tidak lengkap' }, 400);
  }
  const folder = DriveApp.getFolderById(folderId);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  const file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {}
  const fileUrl = 'https://drive.google.com/uc?export=download&id=' + file.getId();
  const viewUrl = 'https://drive.google.com/file/d/' + file.getId() + '/view';
  return jsonResponse({
    status: 'success',
    fileId: file.getId(),
    fileName: file.getName(),
    downloadUrl: fileUrl,
    viewUrl: viewUrl,
    sizeBytes: file.getSize()
  }, 200);
}
function jsonResponse(body, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(body));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}