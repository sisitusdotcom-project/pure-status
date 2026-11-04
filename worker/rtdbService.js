const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
class RTDBService {
  constructor(databaseUrl, secret, serviceAccountPath) {
    this.databaseUrl = (databaseUrl || '').replace(/\/+$/, '');
    this.secret = secret || '';
    this.useAdmin = false;
    this.db = null;
    this.initAdmin(serviceAccountPath);
  }
  initAdmin(saPath) {
    const keyPath = saPath || process.env.FIREBASE_SERVICE_ACCOUNT_KEY || path.join(process.cwd(), 'serviceAccountKey.json');
    if (fs.existsSync(keyPath)) {
      try {
        const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert(sa),
            databaseURL: this.databaseUrl
          });
        }
        this.db = admin.database();
        this.useAdmin = true;
      } catch (err) {}
    }
  }
  buildUrl(endpoint) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (this.secret) {
      return `${this.databaseUrl}${cleanEndpoint}.json?auth=${encodeURIComponent(this.secret)}`;
    }
    return `${this.databaseUrl}${cleanEndpoint}.json`;
  }
  async getQueue() {
    if (this.useAdmin && this.db) {
      const snap = await this.db.ref('queue').once('value');
      return snap.val() || {};
    }
    const url = this.buildUrl('/queue');
    const response = await axios.get(url);
    return response.data || {};
  }
  async removeQueueItem(jobId) {
    if (this.useAdmin && this.db) {
      await this.db.ref(`queue/${jobId}`).remove();
      return;
    }
    const url = this.buildUrl(`/queue/${jobId}`);
    await axios.delete(url);
  }
  async updateJob(jobId, data) {
    const payload = {
      ...data,
      updatedAt: Date.now()
    };
    if (this.useAdmin && this.db) {
      await this.db.ref(`jobs/${jobId}`).update(payload);
      return payload;
    }
    const url = this.buildUrl(`/jobs/${jobId}`);
    const response = await axios.patch(url, payload);
    return response.data;
  }
  async getJob(jobId) {
    if (this.useAdmin && this.db) {
      const snap = await this.db.ref(`jobs/${jobId}`).once('value');
      return snap.val();
    }
    const url = this.buildUrl(`/jobs/${jobId}`);
    const response = await axios.get(url);
    return response.data;
  }
  async getAllJobs() {
    if (this.useAdmin && this.db) {
      const snap = await this.db.ref('jobs').once('value');
      return snap.val() || {};
    }
    const url = this.buildUrl('/jobs');
    const response = await axios.get(url);
    return response.data || {};
  }
  async createJob(jobId, jobData) {
    if (this.useAdmin && this.db) {
      await this.db.ref(`jobs/${jobId}`).set(jobData);
      await this.db.ref(`queue/${jobId}`).set(jobData);
      return jobData;
    }
    const urlJob = this.buildUrl(`/jobs/${jobId}`);
    const urlQueue = this.buildUrl(`/queue/${jobId}`);
    await axios.put(urlJob, jobData);
    await axios.put(urlQueue, jobData);
    return jobData;
  }
}
module.exports = RTDBService;