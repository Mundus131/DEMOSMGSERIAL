const fs = require('fs').promises;
const path = require('path');
const lockfile = require('proper-lockfile');
const { LOG_PATHS } = require('./logger');

const DEFAULT_CONFIG = {
  maxEntries: {
    codes: 10,
    states: 100,
    weights: 10,
    dataFrames: 10
  },
  interval: 60000 // 1 godzina
};

class JSONCleaner {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.interval = null;
    this.lastRun = null;
  }

  async cleanFile(filePath, maxEntries) {
    let release;
    try {
      release = await lockfile.lock(filePath, { 
        retries: 3,
        maxRetryTime: 5000,
        stale: 10000
      });

      let content = '';
      try {
        content = await fs.readFile(filePath, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.log(`[cleaner] File ${filePath} not found, skipping`);
          return;
        }
        throw err;
      }

      const lines = content.split('\n').filter(line => line.trim() !== '');
      if (lines.length === 0) return;

      // Zachowujemy tylko najnowsze wpisy
      const latestEntries = lines.slice(-maxEntries);

      await fs.writeFile(filePath, latestEntries.join('\n') + '\n', 'utf8');
      this.lastRun = new Date();
      
      console.log(`[${this.lastRun.toISOString()}] Cleaned ${path.basename(filePath)}, kept ${latestEntries.length}/${lines.length} entries`);
    } catch (err) {
      console.error(`[cleaner] Error cleaning ${filePath}:`, err.message);
    } finally {
      if (release) {
        try {
          await release();
        } catch (err) {
          console.error(`[cleaner] Error releasing lock for ${filePath}:`, err.message);
        }
      }
    }
  }

  async cleanAll() {
    try {
      await Promise.all([
        this.cleanFile(LOG_PATHS.codes, this.config.maxEntries.codes),
        this.cleanFile(LOG_PATHS.states, this.config.maxEntries.states),
        this.cleanFile(LOG_PATHS.weights, this.config.maxEntries.weights),
        this.cleanFile(LOG_PATHS.dataFrames, this.config.maxEntries.dataFrames)
      ]);
    } catch (err) {
      console.error('[cleaner] Error during cleaning:', err);
    }
  }

  start() {
    // Wstępne czyszczenie
    this.cleanAll().catch(console.error);
    
    // Ustawienie interwału
    this.interval = setInterval(() => {
      this.cleanAll();
    }, this.config.interval);

    console.log(`[cleaner] Started with interval ${this.config.interval}ms`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('[cleaner] Stopped');
  }

  getStatus() {
    return {
      running: !!this.interval,
      lastRun: this.lastRun,
      nextRun: this.lastRun ? new Date(this.lastRun.getTime() + this.config.interval) : null
    };
  }
}

// Funkcje pomocnicze dla starszego interfejsu
async function keepLatestNEntries(filePath, n) {
  const cleaner = new JSONCleaner();
  await cleaner.cleanFile(filePath, n);
}

function startJsonCleaners(n = 100, intervalMs = 60000) {
  const cleaner = new JSONCleaner({
    maxEntries: {
      codes: n,
      states: n,
      weights: n,
      dataFrames: n
    },
    interval: intervalMs
  });
  cleaner.start();
  return cleaner;
}

module.exports = {
  JSONCleaner,
  startJsonCleaners,
  keepLatestNEntries
};