const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const net = require('net');
const ping = require('ping');
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
const loadSession = require('./resources/loadSession');
const cdf = require('./resources/cdfa');
const { ASSETS_ROOT, captureImagesForSummary } = require('./resources/ftpArchive');

const app = express();
const PORT = process.env.PORT || 5010;
const sseClients = new Set();

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

function publishEvent(type, payload) {
  const message = `data: ${JSON.stringify({ type, payload, timestamp: new Date().toISOString() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (error) {
      sseClients.delete(client);
    }
  }
}

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
  app.use('/api/load-session/assets', express.static(ASSETS_ROOT));

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
  app.get('/api/rs/system', async (req, res) => {
    try {
      const runtime = await rs.getRuntimeInfo();
      res.json({ success: true, runtime });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

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

  app.get('/api/cdf/status', (req, res) => {
    res.json({ success: true, status: cdf.getStatus() });
  });

  app.get('/api/events/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    res.write(`data: ${JSON.stringify({
      type: 'snapshot',
      payload: {
        loadSession: loadSession.getStatus(),
        cdf: cdf.getStatus(),
        rfid: tdc.getRfidStatus ? tdc.getRfidStatus() : { active: false, readers: [] },
      },
      timestamp: new Date().toISOString()
    })}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  app.post('/api/cdf/manual', (req, res) => {
    try {
      const batchNumber = String(req.body?.batchNumber || '').trim();
      if (!batchNumber) {
        return res.status(400).json({ success: false, error: 'Brak numeru partii' });
      }
      cdf.setManualBatchNumber(batchNumber);
      res.json({ success: true, status: cdf.getStatus() });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/load-session/status', (req, res) => {
    res.json({ success: true, ...loadSession.getStatus(), cdf: cdf.getStatus() });
  });

  app.post('/api/load-session/batch-number', async (req, res) => {
    try {
      const result = await loadSession.setBatchNumber(req.body?.batchNumber, req.body?.source || 'manual');
      res.json({ success: true, result, status: loadSession.getStatus() });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.post('/api/load-session/start', async (req, res) => {
    try {
      const provided = String(req.body?.batchNumber || '').trim();
      const fallback = cdf.getStatus().lastBatchNumber;
      const batchNumber = provided || fallback;
      const source = provided ? 'manual' : (cdf.getStatus().lastSource || 'cdf');
      const status = await loadSession.start(batchNumber, source);
      res.json({ success: true, ...status });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.post('/api/load-session/stop', async (req, res) => {
    try {
      const result = await loadSession.stop();
      const ftpConfig = configWatcher.lastConfig?.network?.ftp || {};
      const ftpResult = await captureImagesForSummary(result.summary, ftpConfig);
      const enrichedSummary = await loadSession.enrichLastSummary({
        images: ftpResult.images,
        imageCount: ftpResult.images.length,
        ftpCapture: ftpResult.ftpCapture,
      });
      cdf.clearBatchNumber();
      res.json({
        success: true,
        ...result,
        summary: enrichedSummary || {
          ...result.summary,
          images: ftpResult.images,
          imageCount: ftpResult.images.length,
          ftpCapture: ftpResult.ftpCapture,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/network/ping', async (req, res) => {
    try {
      const host = String(req.body?.host || '').trim();
      const port = Number(req.body?.port) || 0;

      if (!host) {
        return res.status(400).json({ success: false, error: 'Brak hosta do sprawdzenia' });
      }

      const icmp = await ping.promise.probe(host, { timeout: 2 });
      const tcp = await new Promise((resolve) => {
        if (!port) {
          resolve({ ok: null, message: 'Brak portu TCP' });
          return;
        }

        const socket = new net.Socket();
        const finish = (payload) => {
          socket.destroy();
          resolve(payload);
        };

        socket.setTimeout(2000);
        socket.once('connect', () => finish({ ok: true, message: 'TCP connection established' }));
        socket.once('timeout', () => finish({ ok: false, message: 'TCP timeout' }));
        socket.once('error', (error) => finish({ ok: false, message: error.message }));
        socket.connect(port, host);
      });

      res.json({
        success: true,
        icmp: {
          ok: icmp.alive,
          timeMs: icmp.time,
          output: icmp.output,
        },
        tcp,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/network/reconnect', async (req, res) => {
    try {
      const target = String(req.body?.target || '').trim().toLowerCase();
      const config = configWatcher.lastConfig || {};

      if (target === 'rfid') {
        tdc.reloadSystemConfig(config, true);
        return res.json({ success: true, message: 'Polaczenie RFID zostalo zrestartowane' });
      }

      if (target === 'cdf') {
        cdf.applyConfig(config?.network?.cdf || null);
        cdf.restart();
        return res.json({ success: true, message: 'Polaczenie CDF zostalo zrestartowane' });
      }

      if (target === 'rs') {
        rs.restartSerial();
        return res.json({ success: true, message: 'Polaczenie RS zostalo zrestartowane' });
      }

      if (target === 'ftp') {
        return res.json({ success: true, message: 'FTP nie utrzymuje stalego polaczenia - konfiguracja gotowa do uzycia' });
      }

      return res.status(400).json({ success: false, error: 'Nieznany target reconnect' });
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

    console.log('Inicjalizacja sesji załadunku...');
    await loadSession.initialize();

    console.log('Inicjalizacja CDF...');
    cdf.applyConfig(config.network?.cdf || null);
    configWatcher.on('configChanged', ({ newConfig }) => {
      cdf.applyConfig(newConfig?.network?.cdf || null);
    });
    cdf.on('batchNumber', async ({ batchNumber, source }) => {
      try {
        await loadSession.setBatchNumber(batchNumber, source);
      } catch (error) {
        console.log('[CDF] Zaktualizowano numer partii poza aktywną sesją:', batchNumber);
      }
    });
    cdf.on('frameReceived', (payload) => {
      publishEvent('cdf.frame', payload);
    });
    cdf.on('batchNumber', (payload) => {
      publishEvent('cdf.batchNumber', payload);
      publishEvent('cdf.status', cdf.getStatus());
    });

    loadSession.on('started', (payload) => {
      publishEvent('loadSession.started', payload);
      publishEvent('loadSession.status', loadSession.getStatus());
    });
    loadSession.on('stopped', (payload) => {
      publishEvent('loadSession.stopped', payload);
      publishEvent('loadSession.status', loadSession.getStatus());
    });
    loadSession.on('cycleRegistered', (payload) => {
      publishEvent('loadSession.cycleRegistered', payload);
      publishEvent('loadSession.status', loadSession.getStatus());
    });
    loadSession.on('batchNumberChanged', (payload) => {
      publishEvent('loadSession.batchNumberChanged', payload);
      publishEvent('loadSession.status', loadSession.getStatus());
    });



    tdc.on('cycleCompleted', async (result) => {
      console.log('[TDC] Cykl zakończony:', result);
      try {
       console.log("[TDC] Cykl OK")

      } catch (error) {
        console.error('[SEC] Błąd:', error);
      }
    });
    tdc.on('rfidCycleCompleted', (payload) => {
      publishEvent('rfid.cycle', payload);
      publishEvent('rfid.status', tdc.getRfidStatus());
    });

    if (tdc.getRfidStatus) {
      const currentStatus = tdc.getRfidStatus();
      if (currentStatus?.readers) {
        publishEvent('rfid.status', currentStatus);
      }
    }

    tdc.on('rfidFrameReceived', (payload) => {
      publishEvent('rfid.frame', payload);
      publishEvent('rfid.status', tdc.getRfidStatus());
    });
    tdc.on('rfidStatusChanged', (payload) => {
      publishEvent('rfid.status', payload);
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
    cdf.stop();
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
