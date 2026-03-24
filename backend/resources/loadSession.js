const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, '../data/load-sessions');
const STATUS_FILE = path.join(SESSIONS_DIR, 'current-session.json');
const HISTORY_FILE = path.join(SESSIONS_DIR, 'history.json');

function sanitizeFileName(value) {
  return String(value || 'session')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

class LoadSessionManager extends EventEmitter {
  constructor() {
    super();
    this.currentSession = null;
    this.lastSummary = null;
    this.lastSummaryFilePath = null;
  }

  async initialize() {
    await fs.ensureDir(SESSIONS_DIR);
    this.currentSession = await this.readJsonSafe(STATUS_FILE, null);
    if (this.currentSession) {
      this.currentSession.uniqueTags = Array.isArray(this.currentSession.uniqueTags) ? this.currentSession.uniqueTags : [];
      this.currentSession.cycles = Array.isArray(this.currentSession.cycles) ? this.currentSession.cycles : [];
      this.currentSession.recentReads = Array.isArray(this.currentSession.recentReads) ? this.currentSession.recentReads : [];
      this.currentSession.externalReads = Array.isArray(this.currentSession.externalReads) ? this.currentSession.externalReads : [];
      this.currentSession.totalReads = Number(this.currentSession.totalReads) || 0;
      this.currentSession.cycleCount = Number(this.currentSession.cycleCount) || 0;
    }
    this.lastSummary = await this.readJsonSafe(HISTORY_FILE, []).then((history) => history[0] || null);
    this.lastSummaryFilePath = this.lastSummary?.summaryFilePath || null;
  }

  async readJsonSafe(filePath, fallback) {
    try {
      return await fs.readJson(filePath);
    } catch (error) {
      return fallback;
    }
  }

  async writeCurrentSession() {
    if (this.currentSession) {
      await fs.writeJson(STATUS_FILE, this.currentSession, { spaces: 2 });
    } else {
      await fs.remove(STATUS_FILE);
    }
  }

  normalizeBatchNumber(batchNumber) {
    return String(batchNumber || '').trim();
  }

  getStatus() {
    return {
      active: Boolean(this.currentSession?.active),
      session: this.currentSession,
      lastSummary: this.lastSummary,
    };
  }

  async setBatchNumber(batchNumber, source = 'manual') {
    const normalized = this.normalizeBatchNumber(batchNumber);
    if (!normalized) {
      throw new Error('Batch number is required');
    }

    if (this.currentSession?.active) {
      this.currentSession.batchNumber = normalized;
      this.currentSession.batchSource = source;
      this.currentSession.updatedAt = new Date().toISOString();
      await this.writeCurrentSession();
    }

    this.emit('batchNumberChanged', { batchNumber: normalized, source });
    return { batchNumber: normalized, source };
  }

  async start(batchNumber, source = 'manual') {
    const normalized = this.normalizeBatchNumber(batchNumber);
    if (!normalized) {
      throw new Error('Batch number is required');
    }

    if (this.currentSession?.active) {
      return this.getStatus();
    }

    const startedAt = new Date().toISOString();
    this.currentSession = {
      id: `load-${Date.now()}`,
      active: true,
      batchNumber: normalized,
      batchSource: source,
      startedAt,
      updatedAt: startedAt,
      cycleCount: 0,
      totalReads: 0,
      uniqueTags: [],
      cycles: [],
      recentReads: [],
      externalReads: [],
    };

    await this.writeCurrentSession();
    this.emit('started', this.currentSession);
    return this.getStatus();
  }

  async registerCycle(payload) {
    if (!this.currentSession?.active) {
      return null;
    }

    const uniqueCodes = Array.isArray(payload.uniqueCodes) ? payload.uniqueCodes.filter(Boolean) : [];
    const uniqueSet = new Set(this.currentSession.uniqueTags);
    uniqueCodes.forEach((code) => uniqueSet.add(code));

    const cycleSummary = {
      timestamp: payload.timestamp || new Date().toISOString(),
      expectedCount: Number(payload.expectedCount) || 0,
      uniqueCount: Number(payload.uniqueCount) || uniqueCodes.length,
      goodRead: Boolean(payload.goodRead),
      uniqueCodes,
      results: payload.results || {},
    };

    this.currentSession.cycleCount += 1;
    this.currentSession.totalReads += uniqueCodes.length;
    this.currentSession.uniqueTags = Array.from(uniqueSet);
    this.currentSession.recentReads = [...uniqueCodes];
    this.currentSession.cycles.unshift(cycleSummary);
    this.currentSession.cycles = this.currentSession.cycles.slice(0, 50);
    this.currentSession.updatedAt = new Date().toISOString();

    await this.writeCurrentSession();
    this.emit('cycleRegistered', this.currentSession);
    return this.currentSession;
  }

  async registerExternalRead(code, source = 'cdf') {
    if (!this.currentSession?.active) {
      return null;
    }

    const normalized = String(code || '').trim();
    if (!normalized) {
      return null;
    }

    const lowered = normalized.toLowerCase();
    if (lowered === 'noread' || lowered === 'norread') {
      return null;
    }

    const uniqueSet = new Set(this.currentSession.uniqueTags || []);
    const latestCycle = this.currentSession.cycles?.[0] || null;
    let cycleUpdated = null;
    let mergedIntoLatestCycle = false;
    let duplicateInLatestCycle = false;

    if (latestCycle) {
      const latestCycleCodes = Array.isArray(latestCycle.uniqueCodes) ? latestCycle.uniqueCodes : [];
      const latestCycleSet = new Set(
        latestCycleCodes
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      );

      if (latestCycleSet.has(normalized)) {
        duplicateInLatestCycle = true;
      } else {
        latestCycleSet.add(normalized);
        latestCycle.uniqueCodes = Array.from(latestCycleSet);
        latestCycle.uniqueCount = latestCycle.uniqueCodes.length;
        if (Number(latestCycle.expectedCount) > 0) {
          latestCycle.goodRead = latestCycle.uniqueCount >= Number(latestCycle.expectedCount);
        }
        latestCycle.results = {
          ...(latestCycle.results || {}),
          cdfSupplement: [...new Set([...(latestCycle.results?.cdfSupplement || []), normalized])],
        };
        cycleUpdated = { ...latestCycle };
        mergedIntoLatestCycle = true;
      }
    }

    if (!duplicateInLatestCycle) {
      uniqueSet.add(normalized);
      this.currentSession.totalReads += 1;
    }

    const externalRead = {
      timestamp: new Date().toISOString(),
      source,
      code: normalized,
      mergedIntoLatestCycle,
      duplicateInLatestCycle,
    };

    this.currentSession.uniqueTags = Array.from(uniqueSet);
    if (mergedIntoLatestCycle && latestCycle) {
      this.currentSession.recentReads = [...latestCycle.uniqueCodes];
    } else if (!duplicateInLatestCycle) {
      const recentSet = new Set(
        [normalized, ...(Array.isArray(this.currentSession.recentReads) ? this.currentSession.recentReads : [])]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      );
      this.currentSession.recentReads = Array.from(recentSet).slice(0, 20);
    }
    this.currentSession.externalReads = [externalRead, ...(this.currentSession.externalReads || [])].slice(0, 50);
    this.currentSession.updatedAt = externalRead.timestamp;

    await this.writeCurrentSession();
    this.emit('externalReadRegistered', {
      session: this.currentSession,
      read: externalRead,
      cycleUpdated,
    });
    return this.currentSession;
  }

  async stop() {
    if (!this.currentSession?.active) {
      return this.getStatus();
    }

    const stoppedAt = new Date().toISOString();
    const summary = {
      id: this.currentSession.id,
      batchNumber: this.currentSession.batchNumber,
      batchSource: this.currentSession.batchSource,
      startedAt: this.currentSession.startedAt,
      stoppedAt,
      cycleCount: this.currentSession.cycleCount,
      totalReads: this.currentSession.totalReads,
      uniqueTagCount: this.currentSession.uniqueTags.length,
      uniqueTags: this.currentSession.uniqueTags,
      recentReads: this.currentSession.recentReads,
      externalReads: this.currentSession.externalReads,
      cycles: this.currentSession.cycles,
    };

    const fileName = `${summary.startedAt.slice(0, 19).replace(/[:T]/g, '-')}_${sanitizeFileName(summary.batchNumber)}.json`;
    const summaryFilePath = path.join(SESSIONS_DIR, fileName);
    summary.summaryFilePath = summaryFilePath;
    await fs.writeJson(summaryFilePath, summary, { spaces: 2 });

    const history = await this.readJsonSafe(HISTORY_FILE, []);
    history.unshift(summary);
    await fs.writeJson(HISTORY_FILE, history.slice(0, 100), { spaces: 2 });

    this.lastSummary = summary;
    this.lastSummaryFilePath = summaryFilePath;
    this.currentSession = null;
    await this.writeCurrentSession();
    this.emit('stopped', summary);

    return {
      active: false,
      summary,
      lastSummary: this.lastSummary,
    };
  }

  async enrichLastSummary(patch = {}) {
    if (!this.lastSummary) {
      return null;
    }

    this.lastSummary = {
      ...this.lastSummary,
      ...patch,
    };

    if (this.lastSummaryFilePath) {
      await fs.writeJson(this.lastSummaryFilePath, this.lastSummary, { spaces: 2 });
    }

    const history = await this.readJsonSafe(HISTORY_FILE, []);
    const nextHistory = history.map((item, index) => (
      index === 0 || item.id === this.lastSummary.id
        ? { ...item, ...patch }
        : item
    ));
    await fs.writeJson(HISTORY_FILE, nextHistory.slice(0, 100), { spaces: 2 });

    return this.lastSummary;
  }
}

module.exports = new LoadSessionManager();
