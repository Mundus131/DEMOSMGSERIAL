const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const configWatcher = require('./configWatcher');
const { logState } = require('./logger');
const { tokenManager } = require('./getToken');

const PROTO_PATH = path.join(__dirname, '../data/protofiles/digitalio-service.proto');

class DigitalIOManager {
  constructor() {
    this.config = null;
    this.client = null;
    this.isConnected = false;
    this.isEnabled = false;
    this.reconnectTimer = null;
    this.retryCount = 0;
    this.cleanupConfigWatcher = null;
    
    // Konfiguracja domyślna
    this.defaultConfig = {
      ipAddress: '192.168.0.100',
      port: 8081,
      reconnectInterval: 30000, // 30 sekund
      maxRetries: 10,
      connectionTimeout: 10000 // 10 sekund
    };
    
    this.initialize();
  }

  async initialize() {
    await this.updateConfig();
    this.watchConfigurationChanges();
    if (this.isEnabled) {
      await this.createConnection();
    }
  }

  async updateConfig() {
    const tdcConfig = configWatcher.lastConfig?.tdc?.deviceConfig;
    
    if (tdcConfig) {
      this.isEnabled = true;
      this.config = {
        ...this.defaultConfig,
        ipAddress: tdcConfig.ipAddress || this.defaultConfig.ipAddress,
        port: tdcConfig.port || this.defaultConfig.port
      };
      
      await logState(`[DigitalIO] Zaktualizowano konfigurację: ${this.config.ipAddress}:${this.config.port}`);
    } else {
      this.isEnabled = false;
      this.config = null;
      this.isConnected = false;
      await logState('[DigitalIO] Brak konfiguracji TDC deviceConfig - moduł DigitalIO pozostaje wyłączony');
    }
  }

  watchConfigurationChanges() {
    if (this.cleanupConfigWatcher) {
      this.cleanupConfigWatcher();
    }

    const handleChange = async (config) => {
      if (config?.deviceConfig) {
        await logState('[DigitalIO] Wykryto zmianę konfiguracji TDC');
        const oldConfig = JSON.parse(JSON.stringify(this.config));
        await this.updateConfig();

        if (!this.isEnabled) {
          this.isConnected = false;
          this.client = null;
          return;
        }
        
        // Jeśli zmienił się adres IP lub port, odtwórz połączenie
        if (!oldConfig || oldConfig.ipAddress !== this.config.ipAddress || oldConfig.port !== this.config.port) {
          await this.recreateConnection();
        }
      }
    };

    configWatcher.on('tdcConfigChanged', handleChange);
    
    this.cleanupConfigWatcher = () => {
      configWatcher.off('tdcConfigChanged', handleChange);
    };
  }

  createGrpcClient() {
    try {
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      });
      
      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
      const digitalio = protoDescriptor.hal.digitalio;
      
      const target = `${this.config.ipAddress}:${this.config.port}`;
      const client = new digitalio.DigitalIO(target, grpc.credentials.createInsecure());
      
      return client;
    } catch (error) {
      logState(`[DigitalIO] Błąd tworzenia klienta gRPC: ${error.message}`);
      throw error;
    }
  }

  async createConnection() {
    try {
      this.client = this.createGrpcClient();
      this.isConnected = true;
      this.retryCount = 0;
      
      await logState(`[DigitalIO] ✅ Połączono z ${this.config.ipAddress}:${this.config.port}`);
      
      // Wyczyść timer reconnect jeśli był aktywny
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      
    } catch (error) {
      this.isConnected = false;
      await logState(`[DigitalIO] ❌ Błąd połączenia: ${error.message}`);
      this.handleConnectionError(error);
    }
  }

  async recreateConnection() {
    await logState('[DigitalIO] Odtwarzam połączenie...');
    this.isConnected = false;
    this.client = null;
    await this.createConnection();
  }

  handleConnectionError(error) {
    this.isConnected = false;
    this.retryCount++;
    
    if (this.retryCount <= this.config.maxRetries) {
      const delay = Math.min(this.config.reconnectInterval * this.retryCount, 300000); // max 5 min
      
      logState(`[DigitalIO] Ponawiam próbę ${this.retryCount}/${this.config.maxRetries} za ${delay/1000}s`);
      
      this.reconnectTimer = setTimeout(() => {
        this.createConnection();
      }, delay);
    } else {
      logState(`[DigitalIO] Przekroczono maksymalną liczbę prób (${this.config.maxRetries})`);
      // Reset po 10 minutach
      setTimeout(() => {
        this.retryCount = 0;
        this.createConnection();
      }, 600000);
    }
  }

  async ensureConnection() {
    if (!this.isEnabled) {
      throw new Error('DigitalIO is disabled - missing TDC deviceConfig');
    }

    if (!this.isConnected || !this.client) {
      await this.createConnection();
      if (!this.isConnected) {
        throw new Error('Brak połączenia z urządzeniem DigitalIO');
      }
    }
  }

  async getMetadata() {
    const token = await tokenManager.getToken();
    const metadata = new grpc.Metadata();
    metadata.add('Authorization', `Bearer ${token}`);
    return metadata;
  }

  async executeWithRetry(operation, operationName) {
    let lastError;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.ensureConnection();
        const metadata = await this.getMetadata();
        return await operation(metadata);
      } catch (error) {
        lastError = error;
        await logState(`[DigitalIO] ${operationName} - próba ${attempt}/3 nieudana: ${error.message}`);
        
        if (attempt < 3) {
          // Jeśli błąd związany z połączeniem, odtwórz je
          if (error.code === grpc.status.UNAVAILABLE || error.code === grpc.status.DEADLINE_EXCEEDED) {
            this.isConnected = false;
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }
    }
    
    throw lastError;
  }

  // Pobierz listę urządzeń digital IO
  async listDevices() {
    return await this.executeWithRetry(
      (metadata) => new Promise((resolve, reject) => {
        this.client.ListDevices({}, metadata, (err, response) => {
          if (err) return reject(err);
          resolve(response.devices);
        });
      }),
      'ListDevices'
    );
  }

  // Ustaw kierunek pinu (IN / OUT)
  async setDirection(name, direction) {
    return await this.executeWithRetry(
      (metadata) => new Promise((resolve, reject) => {
        this.client.SetDirection({ name, direction }, metadata, (err, _) => {
          if (err) return reject(err);
          resolve();
        });
      }),
      `SetDirection(${name}, ${direction})`
    );
  }

  // Odczytaj stan pinu (LOW / HIGH / ERROR)
  async read(name) {
    return await this.executeWithRetry(
      (metadata) => new Promise((resolve, reject) => {
        this.client.Read({ name }, metadata, (err, response) => {
          if (err) return reject(err);
          resolve(response.state);
        });
      }),
      `Read(${name})`
    );
  }

  // Zapisz stan pinu (LOW / HIGH)
  async write(name, state) {
    return await this.executeWithRetry(
      (metadata) => new Promise((resolve, reject) => {
        this.client.Write({ name, state }, metadata, (err, _) => {
          if (err) return reject(err);
          resolve();
        });
      }),
      `Write(${name}, ${state})`
    );
  }

  // Podpięcie (stream) do zdarzeń pinu
  async attach(onData, onError, onEnd) {
    await this.ensureConnection();
    const metadata = await this.getMetadata();
    
    const call = this.client.Attach({}, metadata);
    
    call.on('data', onData);
    call.on('error', (error) => {
      logState(`[DigitalIO] Błąd strumienia: ${error.message}`);
      this.isConnected = false;
      if (onError) onError(error);
    });
    call.on('end', onEnd);
    
    return call;
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      isEnabled: this.isEnabled,
      retryCount: this.retryCount,
      config: {
        ipAddress: this.config?.ipAddress,
        port: this.config?.port
      }
    };
  }

  async cleanup() {
    if (this.cleanupConfigWatcher) {
      this.cleanupConfigWatcher();
      this.cleanupConfigWatcher = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.isConnected = false;
    this.client = null;
    await logState('[DigitalIO] Wyczyszczono zasoby');
  }
}

const digitalIOManager = new DigitalIOManager();

// Kompatybilność z istniejącym kodem
async function listDevices() {
  return await digitalIOManager.listDevices();
}

async function setDirection(name, direction) {
  return await digitalIOManager.setDirection(name, direction);
}

async function read(name) {
  return await digitalIOManager.read(name);
}

async function write(name, state) {
  return await digitalIOManager.write(name, state);
}

async function attach(onData, onError, onEnd) {
  return await digitalIOManager.attach(onData, onError, onEnd);
}

module.exports = {
  listDevices,
  setDirection,
  read,
  write,
  attach,
  digitalIOManager
};
