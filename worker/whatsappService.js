const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
function formatPhoneNumber(phone) {
  let cleaned = String(phone).replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  }
  return cleaned;
}
async function sendViaGateway(config, targetPhone, filePath, caption) {
  const target = formatPhoneNumber(targetPhone);
  const { gatewayUrl, apiKey } = config;
  if (!gatewayUrl) {
    throw new Error('WA_GATEWAY_URL belum dikonfigurasi di file .env');
  }
  const form = new FormData();
  form.append('target', target);
  form.append('caption', caption || '');
  form.append('file', fs.createReadStream(filePath));
  const headers = {
    ...form.getHeaders()
  };
  if (apiKey) {
    headers['Authorization'] = apiKey;
  }
  const response = await axios.post(gatewayUrl, form, {
    headers: headers,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });
  return response.data;
}
async function sendToWhatsApp(config, targetPhone, fileList, baseCaption = '') {
  const results = [];
  for (let i = 0; i < fileList.length; i++) {
    const item = fileList[i];
    let captionText = baseCaption;
    if (fileList.length > 1) {
      captionText = `[Part ${item.partIndex}/${item.totalParts}] ${baseCaption}`.trim();
    }
    const res = await sendViaGateway(config, targetPhone, item.filePath, captionText);
    results.push(res);
  }
  return results;
}
module.exports = {
  formatPhoneNumber,
  sendToWhatsApp
};