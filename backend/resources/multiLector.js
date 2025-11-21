const EventEmitter = require('events');
const net = require('net');
const fs = require('fs');
const path = require('path');

class MultiLectorController extends EventEmitter {
  constructor(lectorsConfig, port = 2112) {
    super();
    this.lectorsConfig = lectorsConfig;
    this.port = port;
    this.clients = {};
    this.currentCycle = null;
    this.resultsFile = path.join(__dirname, 'results.json');
  }

  /** Start połączeń TCP z lectorami */
  startAll() {
    for (const [name, ip] of Object.entries(this.lectorsConfig)) {
      this.startClient(name, ip);
    }
  }

  startClient(name, ip) {
    const client = new net.Socket();

    client.on('connect', () => {
      console.log(`[${name}] Połączono z ${ip}:${this.port}`);
    });

    client.on('data', (data) => {
      const raw = data.toString().trim();
      const parsed = this.parseFrame(raw);

      console.log(`[${name}] Odebrano ramkę: ${raw}`);

      this.onLectorFrame(name, parsed);
    });

    client.on('error', (err) => {
      console.log(`[${name}] Błąd: ${err.message}`);
      setTimeout(() => this.startClient(name, ip), 5000);
    });

    client.on('close', () => {
      console.log(`[${name}] Połączenie zamknięte`);
      setTimeout(() => this.startClient(name, ip), 5000);
    });

    client.connect(this.port, ip);
    this.clients[name] = client;
  }

  stopAll() {
    for (const client of Object.values(this.clients)) {
      client.destroy();
    }
    this.clients = {};
  }

  /** Parsowanie ramki <STX> ... <ETX> */
  parseFrame(raw) {
    const STX = '\x02';
    const ETX = '\x03';

    const startIndex = raw.indexOf(STX);
    const stopIndex = raw.indexOf(ETX);

    if (startIndex === -1 || stopIndex === -1 || stopIndex <= startIndex) {
      return [];
    }

    const content = raw.slice(startIndex + 1, stopIndex).trim();

    if (!content || content.toLowerCase() === 'noread') {
      return ['NoRead'];
    }

    return content.split(';').map(p => p.trim()).filter(Boolean);
  }

  /** Start nowego cyklu */
  startCycle() {
    if (this.currentCycle?.active) {
      console.log('[TDC] Drugi trigger podczas aktywnego cyklu – restartuję');
      this.finishCycle(false);
    }

    this.currentCycle = {
      active: true,
      received: {},
      timeout: setTimeout(() => {
        console.log('[TDC] Cykl wygasł (bardzo długi timeout)');
        this.finishCycle(false);
      }, 3600000) // 1h
    };

    console.log('[TDC] Rozpoczęto nowy cykl');
  }

  /** Obsługa danych z lectora */
  onLectorFrame(name, data) {
    if (!this.currentCycle?.active) return;

    this.currentCycle.received[name] = data;

    const expected = Object.keys(this.lectorsConfig).length;
    const received = Object.keys(this.currentCycle.received).length;

    if (received === expected) {
      this.finishCycle(true);
    }
  }

  /** Zakończenie cyklu */
  finishCycle(success) {
    if (!this.currentCycle?.active) return;

    clearTimeout(this.currentCycle.timeout);

    // filtracja duplikatów dla każdego lectora
    const filteredResults = {};
    for (const [name, codes] of Object.entries(this.currentCycle.received)) {
      filteredResults[name] = [...new Set(codes)]; // unikalne kody
    }

    console.log(`[TDC] CYKL ZAKOŃCZONY (${success ? 'OK' : 'BŁĄD'})`);
    console.log('[TDC] Odczytane kody:', filteredResults);

    this.saveResults({
      timestamp: new Date().toISOString(),
      success,
      results: filteredResults
    });

    this.emit('cycleCompleted', {
      success,
      results: filteredResults
    });

    this.currentCycle.active = false;
  }

  /** Zapis wyników do pliku JSON */
  saveResults(entry) {
  try {
    fs.writeFileSync(this.resultsFile, JSON.stringify(entry, null, 2), 'utf8');
    console.log('[TDC] Wyniki zapisane do results.json');
  } catch (e) {
    console.error('[TDC] Błąd zapisu results.json:', e.message);
  }
}

}

module.exports = MultiLectorController;
