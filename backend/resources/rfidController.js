const EventEmitter = require('events');
const net = require('net');
const { isValidHost } = require('./netUtils');

class RFIDController extends EventEmitter {
  constructor(readers = []) {
    super();
    this.readers = (readers || []).map((reader, index) => ({
      id: reader.id || `RFID-${index + 1}`,
      ip: reader.ip,
      port: reader.port,
      role: reader.role === 'server' ? 'server' : 'client',
    }));
    this.clients = {};
    this.servers = {};
    this.currentCycle = null;
    this.lastRead = {};
  }

  startAll() {
    for (const reader of this.readers) {
      const readerId = reader.id || `${reader.ip}:${reader.port}`;
      if (reader.role === 'server') {
        this.startServer(readerId, reader.ip, reader.port);
      } else {
        this.startClient(readerId, reader.ip, reader.port);
      }
    }
  }

  startClient(id, ip, port) {
    if (!ip || !port || !isValidHost(ip)) return;
    const client = new net.Socket();

    client.on('connect', () => {
      console.log(`[RFID ${id}] Połączono z ${ip}:${port}`);
    });

    client.on('data', (data) => {
      const raw = data.toString().trim();
      const parsed = this.parseFrame(raw);

      console.log(`[RFID ${id}] Odebrano ramkę: ${raw}`);
      const payload = {
        tags: parsed,
        raw,
        timestamp: new Date().toISOString()
      };
      this.lastRead[id] = payload;
      this.emit('frameReceived', {
        readerId: id,
        ...payload
      });
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

    try {
      client.connect(port, ip);
    } catch (error) {
      console.log(`[RFID ${id}] Błąd połączenia: ${error.message}`);
    }
    this.clients[id] = client;
  }

  startServer(id, ip, port) {
    if (!port || (ip && !isValidHost(ip))) return;

    const server = net.createServer((socket) => {
      socket.on('data', (data) => {
        const raw = data.toString().trim();
        const parsed = this.parseFrame(raw);

        console.log(`[RFID ${id}] Odebrano ramkę (server): ${raw}`);
        const payload = {
          tags: parsed,
          raw,
          timestamp: new Date().toISOString(),
        };
        this.lastRead[id] = payload;
        this.emit('frameReceived', {
          readerId: id,
          ...payload
        });
        this.onReaderFrame(id, parsed);
      });

      socket.on('error', (err) => {
        console.log(`[RFID ${id}] Błąd gniazda: ${err.message}`);
      });
    });

    server.on('error', (err) => {
      console.log(`[RFID ${id}] Błąd serwera: ${err.message}`);
      if (err.code !== 'EADDRINUSE') {
        setTimeout(() => this.startServer(id, ip, port), 5000);
      }
    });

    try {
      server.listen(port, ip || '0.0.0.0', () => {
        console.log(`[RFID ${id}] Nasłuchiwanie na ${ip || '0.0.0.0'}:${port}`);
      });
    } catch (error) {
      console.log(`[RFID ${id}] Błąd uruchomienia serwera: ${error.message}`);
    }

    this.servers[id] = server;
  }

  stopAll() {
    for (const client of Object.values(this.clients)) {
      client.destroy();
    }
    for (const server of Object.values(this.servers)) {
      server.close();
    }
    this.clients = {};
    this.servers = {};
  }

  parseFrame(raw) {
    const STX = '\x02';
    const ETX = '\x03';
    const segments = [];

    if (raw.includes(STX) && raw.includes(ETX)) {
      let cursor = 0;
      while (cursor < raw.length) {
        const startIndex = raw.indexOf(STX, cursor);
        if (startIndex === -1) break;
        const stopIndex = raw.indexOf(ETX, startIndex + 1);
        if (stopIndex === -1) break;
        const content = raw.slice(startIndex + 1, stopIndex).trim();
        if (content) {
          segments.push(content);
        }
        cursor = stopIndex + 1;
      }
    }

    if (segments.length === 0) {
      const normalized = raw.replace(/[\x02\x03]/g, '').trim();
      if (normalized) {
        segments.push(normalized);
      }
    }

    const tags = [];
    for (const segment of segments) {
      if (segment.toLowerCase() === 'noread') {
        tags.push('NoRead');
        continue;
      }
      const values = segment.split(';').map((part) => part.trim()).filter(Boolean);
      if (values.length === 0) {
        tags.push(segment);
      } else {
        tags.push(...values);
      }
    }

    return [...new Set(tags)];
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
    if (!this.currentCycle?.active) {
      if (this.readers.length === 1) {
        this.emit('cycleCompleted', {
          success: data.some((code) => code && code !== 'NoRead' && code !== 'NORREAD'),
          results: { [id]: data }
        });
      }
      return;
    }
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
          role: reader.role,
          lastRead: this.lastRead[id] || null
        };
      })
    };
  }
}

module.exports = RFIDController;
