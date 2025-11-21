const axios = require('axios');
const configWatcher = require('./configWatcher');
const { logState } = require('./logger');

class TokenManager {
  constructor() {
    this.currentToken = null;
    this.tokenExpiry = null;
    this.config = null;
    this.refreshTimer = null;
    this.reconnectTimer = null;
    this.isRefreshing = false;
    this.cleanupConfigWatcher = null;
    
    // Konfiguracja domyślna
    this.defaultConfig = {
      ipAddress: '192.168.0.100',
      login: 'admin',
      password: 'Welcome1!',
      realm: 'admin',
      tokenRefreshInterval: 300000, // 5 minut
      reconnectInterval: 30000, // 30 sekund
      maxRetries: 10
    };
    
    this.retryCount = 0;
    this.initialize();
  }

  async initialize() {
    await this.updateConfig();
    this.watchConfigurationChanges();
    await this.refreshToken();
  }

  async updateConfig() {
    const tdcConfig = configWatcher.lastConfig?.tdc?.deviceConfig;
    
    if (tdcConfig) {
      this.config = {
        ...this.defaultConfig,
        ipAddress: tdcConfig.ipAddress || this.defaultConfig.ipAddress,
        login: tdcConfig.login || this.defaultConfig.login,
        password: tdcConfig.password || this.defaultConfig.password,
        realm: tdcConfig.realm || this.defaultConfig.realm
      };
      
      await logState(`[TokenManager] Zaktualizowano konfigurację: ${this.config.ipAddress}`);
    } else {
      this.config = { ...this.defaultConfig };
      await logState('[TokenManager] Używam domyślnej konfiguracji');
    }
  }

  watchConfigurationChanges() {
    if (this.cleanupConfigWatcher) {
      this.cleanupConfigWatcher();
    }

    const handleChange = async (config) => {
      if (config?.deviceConfig) {
        await logState('[TokenManager] Wykryto zmianę konfiguracji TDC');
        await this.updateConfig();
        // Odśwież token z nową konfiguracją
        await this.refreshToken();
      }
    };

    configWatcher.on('tdcConfigChanged', handleChange);
    
    this.cleanupConfigWatcher = () => {
      configWatcher.off('tdcConfigChanged', handleChange);
    };
  }

  async getToken() {
    if (!this.currentToken || this.isTokenExpired()) {
      await this.refreshToken();
    }
    return this.currentToken;
  }

  async refreshToken() {
    if (this.isRefreshing) {
      return new Promise((resolve) => {
        const checkToken = () => {
          if (!this.isRefreshing) {
            resolve(this.currentToken);
          } else {
            setTimeout(checkToken, 100);
          }
        };
        checkToken();
      });
    }

    this.isRefreshing = true;
    
    try {
      const loginUrl = `http://${this.config.ipAddress}/auth/login`;
      
      const response = await axios.post(
        loginUrl,
        {
          username: this.config.login,
          password: this.config.password,
          realm: this.config.realm
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      this.currentToken = response.data.token;
      this.tokenExpiry = Date.now() + (this.config.tokenRefreshInterval - 30000); // 30s przed wygaśnięciem
      this.retryCount = 0;

      await logState(`[TokenManager] ✅ Pobrano nowy token z ${this.config.ipAddress}`);
      
      // Zaplanuj odświeżenie tokena
      this.scheduleTokenRefresh();
      
      // Wyczyść timer reconnect jeśli był aktywny
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

    } catch (error) {
      await logState(`[TokenManager] ❌ Błąd pobierania tokena: ${error.message}`);
      this.handleTokenError(error);
    } finally {
      this.isRefreshing = false;
    }
  }

  handleTokenError(error) {
    this.retryCount++;
    
    if (this.retryCount <= this.config.maxRetries) {
      const delay = Math.min(this.config.reconnectInterval * this.retryCount, 300000); // max 5 min
      
      logState(`[TokenManager] Ponawiam próbę ${this.retryCount}/${this.config.maxRetries} za ${delay/1000}s`);
      
      this.reconnectTimer = setTimeout(() => {
        this.refreshToken();
      }, delay);
    } else {
      logState(`[TokenManager] Przekroczono maksymalną liczbę prób (${this.config.maxRetries})`);
      // Reset po 10 minutach
      setTimeout(() => {
        this.retryCount = 0;
        this.refreshToken();
      }, 600000);
    }
  }

  scheduleTokenRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const timeToRefresh = this.tokenExpiry - Date.now();
    
    if (timeToRefresh > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshToken();
      }, timeToRefresh);
    }
  }

  isTokenExpired() {
    return !this.tokenExpiry || Date.now() >= this.tokenExpiry;
  }

  getStatus() {
    return {
      hasToken: !!this.currentToken,
      tokenExpiry: this.tokenExpiry,
      isRefreshing: this.isRefreshing,
      retryCount: this.retryCount,
      config: {
        ipAddress: this.config?.ipAddress,
        login: this.config?.login,
        realm: this.config?.realm
      }
    };
  }

  async cleanup() {
    if (this.cleanupConfigWatcher) {
      this.cleanupConfigWatcher();
      this.cleanupConfigWatcher = null;
    }
    
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.currentToken = null;
    this.tokenExpiry = null;
    await logState('[TokenManager] Wyczyszczono zasoby');
  }
}

const tokenManager = new TokenManager();

// Kompatybilność z istniejącym kodem
async function getToken() {
  return await tokenManager.getToken();
}

module.exports = { 
  getToken, 
  tokenManager 
};