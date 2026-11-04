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
  return jsonResponse({ status: 'ok', service: 'WhatsApp Pure Status Drive Storage' }, 200);
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
    const data = {
      action: normalizeParam(params.action || 'upload'),
      fileName: normalizeParam(params.fileName),
      mimeType: normalizeParam(params.mimeType),
      fileData: normalizeParam(params.fileData),
      folderKey: normalizeParam(params.folderKey || 'raw'),
      folderId: normalizeParam(params.folderId)
    };
    if (data.action === 'upload') {
      return uploadToDrive(data);
    }
    return jsonResponse({ status: 'error', message: 'Aksi tidak valid' }, 400);
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() }, 500);
  }
}
function uploadToDrive(data) {
  const fileName = data.fileName;
  const mimeType = data.mimeType;
  let base64Data = data.fileData || '';
  if (base64Data.includes('base64,')) {
    base64Data = base64Data.split('base64,')[1];
  }
  const folderKey = data.folderKey || 'raw';
  const folderId = data.folderId || DRIVE_FOLDERS[folderKey] || DRIVE_FOLDERS.default;
  if (!fileName || !mimeType || !base64Data) {
    return jsonResponse({ status: 'error', message: 'Data file tidak lengkap' }, 400);
  }
  if (!folderId || folderId.includes('PASTE_ID_FOLDER')) {
    return jsonResponse({ status: 'error', message: 'Folder ID Google Drive belum dikonfigurasi di Apps Script' }, 500);
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