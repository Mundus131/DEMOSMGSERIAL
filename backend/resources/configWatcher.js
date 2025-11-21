const fs = require('fs-extra');
const path = require('path');
const { EventEmitter } = require('events');
const { loadConfiguration } = require('./configuration');

const configFilePath = path.join(__dirname, '../data/configuration/configuration.json');

class ConfigWatcher extends EventEmitter {
  constructor() {
    super();
    this.lastConfig = null;
    this.watcher = null;
  }

  async start() {
    try {
      this.lastConfig = await loadConfiguration();
      this.setupWatcher();
    } catch (e) {
      console.error('[Watcher] Could not load initial configuration:', e.message);
    }
  }

  setupWatcher() {
    this.watcher = fs.watchFile(configFilePath, { interval: 1000 }, async (curr, prev) => {
      if (curr.mtime !== prev.mtime) {
        console.log('[Watcher] Detected configuration change...');
        try {
          const newConfig = await loadConfiguration();
          const oldConfig = this.lastConfig;
          this.lastConfig = newConfig;
          
          // Emit general change
          this.emit('configChanged', { newConfig, oldConfig });
          
          // Emit specific section changes
          if (!oldConfig || JSON.stringify(newConfig.lector) !== JSON.stringify(oldConfig.lector)) {
            this.emit('lectorConfigChanged', newConfig.lector);
          }
          if (!oldConfig || JSON.stringify(newConfig.weight) !== JSON.stringify(oldConfig.weight)) {
            this.emit('weightConfigChanged', newConfig.weight);
          }
          if (!oldConfig || JSON.stringify(newConfig.PLC) !== JSON.stringify(oldConfig.PLC)) {
            this.emit('PLCConfigChanged', newConfig.PLC);
            }
          if (!oldConfig || JSON.stringify(newConfig.tdc) !== JSON.stringify(oldConfig.tdc)) {
            this.emit('tdcConfigChanged', newConfig.tdc);
            }
           if (!oldConfig || JSON.stringify(newConfig.outputStringFormat) !== JSON.stringify(oldConfig.outputStringFormat)) {
            this.emit('tdcConfigChanged', newConfig.outputStringFormat);
            }
        } catch (err) {
          console.error('[Watcher] Failed to reload configuration:', err.message);
        }
      }
    });
  }

  stop() {
    if (this.watcher) {
      fs.unwatchFile(configFilePath);
    }
  }
}

module.exports = new ConfigWatcher();