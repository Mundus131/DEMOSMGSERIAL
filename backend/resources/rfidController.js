const EventEmitter = require('events');
const net = require('net');

class RFIDController extends EventEmitter {
  constructor(readers = []) {
    super();
    this.readers = (readers || []).map((reader, index) => ({
      id: reader.id || `RFID-${index + 1}`,
      ip: reader.ip,
      port: reader.port
    }));
    this.clients = {};
    this.currentCycle = null;
    this.lastRead = {};
  }

  startAll() {
    for (const reader of this.readers) {
      const readerId = reader.id || `${reader.ip}:${reader.port}`;
      this.startClient(readerId, reader.ip, reader.port);
    }
  }

  startClient(id, ip, port) {
    if (!ip || !port) return;
    const client = new net.Socket();

    client.on('connect', () => {
      console.log(`[RFID ${id}] Połączono z ${ip}:${port}`);
    });

    client.on('data', (data) => {
      const raw = data.toString().trim();
      const parsed = this.parseFrame(raw);

      console.log(`[RFID ${id}] Odebrano ramkę: ${raw}`);
      this.lastRead[id] = {
        tags: parsed,
        raw,
        timestamp: new Date().toISOString()
      };
      this.onReaderFrame(id, parsed);
    });

    client.on('error', (err) => {
      console.log(`[RFID ${id}] Błąd: ${err.message}`);
      setTimeout(() => this.startClient(id, ip, port), 5000);
    });

    client.on('close', () => {
      console.log(`[RFID ${id}] Połączenie zamknięte`);
      setTimeout(() => this.startClient(id, ip, port), 5000);
    });

    client.connect(port, ip);
    this.clients[id] = client;
  }

  stopAll() {
    for (const client of Object.values(this.clients)) {
      client.destroy();
    }
    this.clients = {};
  }

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

  startCycle() {
    if (this.currentCycle?.active) {
      console.log('[RFID] Drugi trigger podczas aktywnego cyklu – restartuję');
      this.finishCycle(false);
    }

    this.currentCycle = {
      active: true,
      received: {},
      timeout: setTimeout(() => {
        console.log('[RFID] Cykl wygasł (timeout)');
        this.finishCycle(false);
      }, 60000)
    };

    console.log('[RFID] Rozpoczęto nowy cykl');
  }

  onReaderFrame(id, data) {
    if (!this.currentCycle?.active) return;
    this.currentCycle.received[id] = data;

    const expected = this.readers.length;
    const received = Object.keys(this.currentCycle.received).length;

    if (received === expected) {
      this.finishCycle(true);
    }
  }

  finishCycle(success) {
    if (!this.currentCycle?.active) return;
    clearTimeout(this.currentCycle.timeout);

    const filteredResults = {};
    for (const [id, codes] of Object.entries(this.currentCycle.received)) {
      filteredResults[id] = [...new Set(codes)];
    }

    console.log(`[RFID] CYKL ZAKOŃCZONY (${success ? 'OK' : 'BŁĄD'})`);
    console.log('[RFID] Odczytane kody:', filteredResults);

    this.emit('cycleCompleted', {
      success,
      results: filteredResults
    });

    this.currentCycle.active = false;
  }

  getStatus() {
    return {
      active: !!this.currentCycle?.active,
      readers: this.readers.map((reader, index) => {
        const id = reader.id || `${reader.ip}:${reader.port}` || `RFID-${index + 1}`;
        return {
          id,
          ip: reader.ip,
          port: reader.port,
          lastRead: this.lastRead[id] || null
        };
      })
    };
  }
}

module.exports = RFIDController;
