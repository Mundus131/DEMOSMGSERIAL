const EventEmitter = require('events');
const net = require('net');
const { isValidHost } = require('./netUtils');

class CdfManager extends EventEmitter {
  constructor() {
    super();
    this.config = null;
    this.server = null;
    this.socket = null;
    this.buffer = '';
    this.lastBatchNumber = '';
    this.lastFrame = '';
    this.lastSource = null;
    this.lastUpdatedAt = null;
    this.connectionState = 'idle';
    this.reconnectTimer = null;
  }

  applyConfig(config) {
    const nextConfig = {
      host: config?.host || '',
      port: Number(config?.port) || 0,
      role: config?.role === 'server' ? 'server' : 'client',
    };

    const changed = JSON.stringify(nextConfig) !== JSON.stringify(this.config);
    this.config = nextConfig;

    if (changed) {
      this.restart();
    }
  }

  restart() {
    this.stop();
    if (!this.config?.host || !this.config?.port) {
      this.connectionState = 'idle';
      return;
    }

    if (!isValidHost(this.config.host)) {
      this.connectionState = 'invalid_config';
      return;
    }

    if (this.config.role === 'server') {
      this.startServer();
      return;
    }

    this.startClient();
  }

  stop() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.restart();
    }, 3000);
  }

  startClient() {
    this.connectionState = 'connecting';
    const socket = new net.Socket();
    this.socket = socket;

    socket.on('connect', () => {
      this.connectionState = 'connected';
    });

    socket.on('data', (data) => {
      this.handleIncomingData(data.toString());
    });

    socket.on('error', () => {
      this.connectionState = 'error';
      this.scheduleReconnect();
    });

    socket.on('close', () => {
      this.connectionState = 'disconnected';
      this.scheduleReconnect();
    });

    try {
      socket.connect(this.config.port, this.config.host);
    } catch (error) {
      this.connectionState = 'error';
    }
  }

  startServer() {
    this.connectionState = 'listening';
    this.server = net.createServer((socket) => {
      this.connectionState = 'connected';
      this.socket = socket;

      socket.on('data', (data) => {
        this.handleIncomingData(data.toString());
      });

      socket.on('close', () => {
        this.connectionState = 'listening';
        if (this.socket === socket) {
          this.socket = null;
        }
      });

      socket.on('error', () => {
        this.connectionState = 'error';
      });
    });

    this.server.on('error', () => {
      this.connectionState = 'error';
    });

    try {
      this.server.listen(this.config.port, this.config.host);
    } catch (error) {
      this.connectionState = 'error';
    }
  }

  handleIncomingData(chunk) {
    this.lastFrame = String(chunk || '').replace(/[\x02\x03]/g, '').trim();
    this.emit('frameReceived', {
      raw: this.lastFrame,
      timestamp: new Date().toISOString(),
    });
    this.buffer += chunk;
    const parts = this.buffer.split(/\r?\n/);
    this.buffer = parts.pop() || '';

    for (const line of parts) {
      this.commitBatchFrame(line);
    }

    if (this.buffer && /[\x03;]$/.test(this.buffer)) {
      const remaining = this.buffer;
      this.buffer = '';
      this.commitBatchFrame(remaining);
    }
  }

  commitBatchFrame(frame) {
    const cleaned = String(frame || '')
      .replace(/[\x02\x03]/g, '')
      .trim();

    if (!cleaned) return;

    const batchNumber = cleaned
      .split(/[;\r\n]+/)
      .map((part) => part.trim())
      .find(Boolean);

    if (!batchNumber) return;

    this.lastBatchNumber = batchNumber;
    this.lastSource = 'cdf';
    this.lastUpdatedAt = new Date().toISOString();
    this.emit('batchNumber', {
      batchNumber,
      source: this.lastSource,
      timestamp: this.lastUpdatedAt,
    });
  }

  setManualBatchNumber(batchNumber) {
    this.lastBatchNumber = String(batchNumber || '').trim();
    this.lastSource = 'manual';
    this.lastUpdatedAt = new Date().toISOString();
    this.emit('batchNumber', {
      batchNumber: this.lastBatchNumber,
      source: this.lastSource,
      timestamp: this.lastUpdatedAt,
    });
  }

  clearBatchNumber() {
    this.lastBatchNumber = '';
    this.lastSource = null;
    this.lastUpdatedAt = new Date().toISOString();
    this.emit('batchNumber', {
      batchNumber: '',
      source: 'reset',
      timestamp: this.lastUpdatedAt,
    });
  }

  getStatus() {
    return {
      config: this.config,
      connectionState: this.connectionState,
      lastBatchNumber: this.lastBatchNumber,
      lastFrame: this.lastFrame,
      lastSource: this.lastSource,
      lastUpdatedAt: this.lastUpdatedAt,
    };
  }
}

module.exports = new CdfManager();
