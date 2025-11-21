const EventEmitter = require('events');
const net = require('net');
const configWatcher = require('./configWatcher');
const { decodeControlSequences } = require('./utils');
const { logCode, logState } = require('./logger');

class LectorController extends EventEmitter {
  constructor() {
    super();
    this.currentServer = null;
    this.currentClient = null;
    this.reconnectTimeouts = new Set();
    this.currentSockets = [];
    this.connectionStatus = 'disconnected';
    this.lastCode = null;
    this.configChangeHandler = null;
  }

  extractFrameContent(raw, start, stop) {
  // Jeśli oba znaczniki są puste, zwróć surowe dane
  if ((!start || start.trim() === '') && (!stop || stop.trim() === '')) {
    return raw;
  }

  const startIndex = start ? raw.indexOf(start) : 0;
  const stopIndex = stop ? raw.indexOf(stop) : raw.length;

  // Jeśli któryś z wymaganych znaczników nie został znaleziony
  if ((start && startIndex === -1) || (stop && stopIndex === -1)) {
    return null;
  }

  // Jeśli pozycje znaczników są nieprawidłowe
  if (stopIndex <= startIndex) {
    return null;
  }

  return raw.slice(
    startIndex + (start ? start.length : 0),
    stopIndex
  );
}
  // Obsługa danych z lectora
handleCode(data) {
  const raw = data.toString().trim();
  const { start, stop, separator } = this.formatConfig;
  console.log(`[lector] Odebrano dane: ${raw}`);
  console.log(`[lector] Format: start="${start}", stop="${stop}", separator="${separator}"`);

  const skipFrameCheck = (!start || start.trim() === '') && (!stop || stop.trim() === '');
  const content = skipFrameCheck ? raw : this.extractFrameContent(raw, start, stop);
  console.log(`[lector] Wyciągnięta zawartość: ${content}`);

  if (content === null) {
    this.handleState(`[lector] Niepoprawna ramka: ${JSON.stringify(raw)}`);
    return;
  }

  const parts = content.split(separator).map(p => p.trim()).filter(Boolean);

  if (parts.length === 0) {
    this.handleState(`[lector] Brak kodów w ramce: ${JSON.stringify(raw)}`);
    return;
  }

  const timestamp = new Date().toISOString();
  
  // Zapisujemy WSZYSTKIE kody
  for (const code of parts) {
    this.lastCode = { code, timestamp }; // Nadpisujemy lastCode każdym kodem
    this.emit('codeReceived', { code, timestamp });
    logCode(code).catch(err => console.error('[lector] Failed to write code:', err));
  }

  if (parts.length > 1) {
    this.handleState(`[lector] Odebrano wiele kodów (${parts.length}): ${parts.join(', ')}`);
  }
}



  // Logowanie stanu
  async handleState(message, status = null) {
    try {
      await logState(`[lector] ${message}`);
      if (status) this.connectionStatus = status;
    } catch (err) {
      console.error('[lector] Failed to write state:', err);
    }
  }

  // Czyszczenie połączeń
  async cleanupConnections() {
    // Wyczyść timeouty
    this.reconnectTimeouts.forEach(t => clearTimeout(t));
    this.reconnectTimeouts.clear();

    // Zamknij klienta
    if (this.currentClient) {
      this.currentClient.removeAllListeners();
      this.currentClient.destroy();
      this.currentClient = null;
    }

    // Zamknij serwer
    if (this.currentServer) {
      this.currentSockets.forEach(socket => {
        socket.removeAllListeners();
        socket.destroy();
      });
      this.currentSockets = [];
      
      await new Promise(resolve => {
        this.currentServer.close(() => {
          this.currentServer.removeAllListeners();
          this.currentServer = null;
          resolve();
        });
        setTimeout(resolve, 1000); // Timeout bezpieczeństwa
      });
    }
  }

  // Tryb klienta
  startClientMode(config) {
    if (this.currentClient) return;

    this.handleState(`Łączenie jako klient z ${config.ipAddress}:${config.port}`, 'connecting');
    
    this.currentClient = new net.Socket();
    
    const onError = (err) => {
      if (!this.currentClient) return;
      this.handleState(`Błąd połączenia: ${err.message}`, 'error');
      this.scheduleReconnect(config);
    };

    const onClose = () => {
      if (!this.currentClient) return;
      this.handleState('Połączenie zamknięte', 'disconnected');
      this.scheduleReconnect(config);
    };

    const cleanupClient = () => {
      this.currentClient?.removeListener('error', onError);
      this.currentClient?.removeListener('close', onClose);
      this.currentClient?.destroy();
      this.currentClient = null;
    };

    this.currentClient.on('connect', () => {
      this.handleState('Połączono z lektorem (tryb klienta)', 'connected');
    });

    this.currentClient.on('data', (data) => this.handleCode(data));
    this.currentClient.on('error', onError);
    this.currentClient.on('close', onClose);

    this.currentClient.connect(config.port, config.ipAddress);

    // Zachowanie referencji do funkcji dla cleanupu
    this.currentClient._errorHandler = onError;
    this.currentClient._closeHandler = onClose;
  }

  scheduleReconnect(config) {
    const cleanupClient = () => {
      if (this.currentClient) {
        this.currentClient.removeListener('error', this.currentClient._errorHandler);
        this.currentClient.removeListener('close', this.currentClient._closeHandler);
        this.currentClient.destroy();
        this.currentClient = null;
      }
    };

    cleanupClient();
    const timeoutId = setTimeout(() => {
      this.reconnectTimeouts.delete(timeoutId);
      this.startClientMode(config);
    }, 5000);
    this.reconnectTimeouts.add(timeoutId);
  }

  // Tryb serwera
  startServerMode(config) {
    this.handleState(`Uruchamianie serwera TCP na porcie ${config.port}`, 'starting');

    this.currentServer = net.createServer(socket => {
      this.currentSockets.push(socket);
      this.handleState('Lector podłączony (tryb serwera)', 'connected');

      socket.on('data', (data) => this.handleCode(data));
      socket.on('close', () => {
        this.handleState('Lector rozłączony', 'disconnected');
        this.currentSockets = this.currentSockets.filter(s => s !== socket);
      });
      socket.on('error', err => {
        this.handleState(`Błąd gniazda: ${err.message}`, 'error');
      });
    });

    this.currentServer.listen(config.port, () => {
      this.handleState(`Serwer nasłuchuje na porcie ${config.port}`, 'ready');
    });

    this.currentServer.on('error', err => {
      this.handleState(`Błąd serwera: ${err.message}`, 'error');
    });
  }

  // Główna funkcja startowa
 async startLector(config) {
  try {
    await this.cleanupConnections();

    this.formatConfig = {
      start: config.stringFormat?.start ? decodeControlSequences(config.stringFormat.start) : '',
      stop: config.stringFormat?.stop ? decodeControlSequences(config.stringFormat.stop) : '',
      separator: config.stringFormat?.separator || ';'
    };

    console.log('[lector] Ustawiony formatConfig:', JSON.stringify(this.formatConfig));

    if (config.tcpType === 'client') {
      this.startClientMode(config);
    } else if (config.tcpType === 'server') {
      this.startServerMode(config);
    } else {
      throw new Error(`Nieznany tryb: ${config.tcpType}`);
    }
  } catch (err) {
    this.handleState(`Błąd inicjalizacji: ${err.message}`, 'error');
    console.error('[lector] Init error:', err);
  }
}


  // Obsługa zmian konfiguracji
  watchConfigurationChanges() {
    // Usuń istniejącego listenera jeśli istnieje
    if (this.configChangeHandler) {
      configWatcher.off('lectorConfigChanged', this.configChangeHandler);
    }

    this.configChangeHandler = (config) => {
      console.log('[lector] Wykryto zmianę konfiguracji, restartowanie...');
      this.startLector(config);
    };

    configWatcher.on('lectorConfigChanged', this.configChangeHandler);
  }

  // Cleanup
  async cleanup() {
    await this.cleanupConnections();
    if (this.configChangeHandler) {
      configWatcher.off('lectorConfigChanged', this.configChangeHandler);
      this.configChangeHandler = null;
    }
  }

  // Endpointy API
  setup(app) {
    app.get('/api/lector/status', (req, res) => {
      res.json(this.getStatus());
    });
    

  }
  
  

  // Pobranie statusu
  getStatus() {
    return {
      status: this.connectionStatus,
      lastCode: this.lastCode,
      mode: this.currentServer ? 'server' : this.currentClient ? 'client' : 'inactive'
    };
  }
}

// Eksport singletonu
module.exports = new LectorController();