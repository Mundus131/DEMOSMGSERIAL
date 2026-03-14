const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const configWatcher = require('./resources/configWatcher');
const systemStats = require('./resources/systemStats');
const utils = require('./resources/utils');
const tdc = require('./resources/tdc');
const { digitalIOManager } = require('./resources/digitalio');
const { tokenManager } = require('./resources/getToken');
const { JSONCleaner } = require('./resources/jsonCleaner');
const { LOG_PATHS } = require('./resources/logger');
const logs = require('./resources/logs');
const configuration = require('./resources/configuration');
const rs = require('./resources/rs'); // DODANE
const rsSender = require('./resources/rsSender'); // DODANE

const app = express();
const PORT = process.env.PORT || 5010;

const CLEANER_CONFIG = {
  maxEntries: {
    codes: 10,
    states: 100,
    weights: 10,
    dataFrames: 10
  },
  interval: 3600000 // 1 godzina
};

// Middleware setup
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

async function initialize() {
  try {
    // 1. Utwórz wymagane katalogi z rozszerzeniem .jsonl
    await Promise.all([
      fs.mkdir(path.dirname(LOG_PATHS.codes), { recursive: true }),
      fs.mkdir(path.dirname(LOG_PATHS.states), { recursive: true }),
      fs.mkdir(path.dirname(LOG_PATHS.weights), { recursive: true }),
      fs.mkdir(path.dirname(LOG_PATHS.dataFrames), { recursive: true }),
      fs.mkdir(path.join(__dirname, '../data/configuration'), { recursive: true })
    ]);

    // 2. Inicjalizacja watchera konfiguracji
    await configWatcher.start();

    // 3. Uruchom JSON Cleaner zamiast CSV Cleaner
    const cleaner = new JSONCleaner(CLEANER_CONFIG);
    cleaner.start();

    // 4. Zarejestruj endpointy
    setupRoutes();

    // 5. Uruchom usługi
    await startServices();

    // 6. Uruchom serwer
    app.listen(PORT, () => {
      console.log(`Serwer działa na porcie ${PORT}`);
      console.log('Ścieżki logów:', {
        codes: LOG_PATHS.codes,
        states: LOG_PATHS.states,
        weights: LOG_PATHS.weights,
        dataFrames: LOG_PATHS.dataFrames
      });
    });

  } catch (err) {
    console.error('Błąd inicjalizacji:', err);
    process.exit(1);
  }
}

function setupRoutes() {
  // Podstawowy endpoint statusu
  app.get('/', (req, res) => {
    res.json({
      status: 'running',
      services: {
        tokenManager: tokenManager.getStatus(),
        digitalIO: digitalIOManager.getStatus(),
        tdc: tdc.getStatus()
      },
      timestamp: new Date().toISOString()
    });
  });

  // Endpointy zarządzania tokenem
  app.get('/api/token/status', (req, res) => {
    res.json(tokenManager.getStatus());
  });

  app.post('/api/token/refresh', async (req, res) => {
    try {
      await tokenManager.refreshToken();
      res.json({ success: true, message: 'Token odświeżony' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Endpointy DigitalIO
  app.get('/api/digitalio/status', (req, res) => {
    res.json(digitalIOManager.getStatus());
  });

  app.get('/api/digitalio/devices', async (req, res) => {
    try {
      const devices = await digitalIOManager.listDevices();
      res.json({ success: true, devices });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/digitalio/set-direction', async (req, res) => {
    try {
      const { name, direction } = req.body;
      await digitalIOManager.setDirection(name, direction);
      res.json({ success: true, message: `Kierunek ${name} ustawiony na ${direction}` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/digitalio/read/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const state = await digitalIOManager.read(name);
      res.json({ success: true, name, state });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/digitalio/states', async (req, res) => {
    try {
      const devices = await digitalIOManager.listDevices();
      const deviceList = Array.isArray(devices) ? devices : [];
      const results = await Promise.all(deviceList.map(async (device) => {
        const name = device?.name || device;
        let state = 'UNKNOWN';
        try {
          state = await digitalIOManager.read(name);
        } catch (error) {
          state = 'ERROR';
        }
        return {
          ...device,
          name,
          state
        };
      }));
      res.json({ success: true, devices: results });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/digitalio/write', async (req, res) => {
    try {
      const { name, state } = req.body;
      await digitalIOManager.write(name, state);
      res.json({ success: true, message: `Stan ${name} ustawiony na ${state}` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // RS endpoints
  app.get('/api/rs/config', (req, res) => {
    try {
      const config = rs.loadConfig();
      res.json({ success: true, config });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/rs/config', (req, res) => {
    try {
      rs.saveConfig(req.body);
      res.json({ success: true, message: 'Konfiguracja RS zapisana' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/rs/status', (req, res) => {
    try {
      const status = rs.getPortStatus();
      res.json({ success: true, status });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/rs/read', (req, res) => {
    try {
      const data = rs.readData();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/rs/send', (req, res) => {
    try {
      const { data } = req.body;
      const ok = rs.sendData(data);
      if (!ok) {
        return res.status(500).json({ success: false, error: 'Nie udało się wysłać danych' });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/rs/restart', (req, res) => {
    try {
      rs.restartSerial();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/rs/mode', async (req, res) => {
    try {
      const { mode } = req.body;
      await rs.setMode(mode);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/rs/mode', async (req, res) => {
    try {
      const mode = await rs.getMode();
      res.json({ success: true, mode });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/rfid/status', (req, res) => {
    try {
      const status = tdc.getRfidStatus ? tdc.getRfidStatus() : { active: false, readers: [] };
      res.json({ success: true, status });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Endpointy modułów
  systemStats.setup(app);
  utils.setup(app);
  configuration.setup(app);
  tdc.setup(app);
  logs.setup(app);
}

async function startServices() {
  try {
    // Pobierz konfigurację
    const config = configWatcher.lastConfig;
    
    if (!config) {
      throw new Error('Brak konfiguracji');
    }

    // Inicjalizacja podstawowych usług (TokenManager i DigitalIO już się inicjalizują automatycznie)
    console.log('Inicjalizacja tokenManager...');
    // TokenManager już zainicjalizowany przez konstruktor
    
    console.log('Inicjalizacja digitalIOManager...');
    // DigitalIOManager już zainicjalizowany przez konstruktor

    // Inicjalizacja pozostałych modułów z konfiguracją
    console.log('Inicjalizacja TDC...');
    await tdc.initialize();



    tdc.on('cycleCompleted', async (result) => {
      console.log('[TDC] Cykl zakończony:', result);
      try {
       console.log("[TDC] Cykl OK")

      } catch (error) {
        console.error('[SEC] Błąd:', error);
      }
    });

    // Uruchom watchery konfiguracji
    console.log('Uruchamianie watcherów konfiguracji...');
    tdc.watchConfigurationChanges();

    console.log('Wszystkie usługi zostały uruchomione pomyślnie');
  } catch (err) {
    console.error('Błąd uruchamiania usług:', err);
    throw err;
  }
}

async function shutdown() {
  console.log('\nZamykanie aplikacji...');
  try {
    await Promise.all([
      tokenManager.cleanup(),
      digitalIOManager.cleanup(),
      tdc.cleanup()
    ]);
    configWatcher.stop();
    console.log('Aplikacja zamknięta pomyślnie');
    process.exit(0);
  } catch (err) {
    console.error('Błąd podczas zamykania:', err);
    process.exit(1);
  }
}

// Rejestracja handlerów sygnałów
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Obsługa błędów
process.on('uncaughtException', (err) => {
  console.error('Nieprzechwycony wyjątek:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Nieobsłużona odrzucona obietnica:', promise, 'powód:', reason);
});

// Uruchomienie aplikacji
initialize();
