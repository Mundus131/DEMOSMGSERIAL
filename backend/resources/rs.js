const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const GRPC_TARGET = '192.168.0.100:8081';
const PROTO_PATH = path.join(__dirname, '../protofiles/serial-service.proto');
const CONFIG_PATH = path.join(__dirname, 'serialConfig.json');
const INTERFACE_NAME = 'SERIAL';

let serialPort = null;
let lastSerialData = ''; // przechowuje OSTATNIĄ odebraną ramkę
let parser;
let isPortOpen = false;

const sseClients = [];

function addSseClient(res) {
  sseClients.push(res);
  console.log(`👥 [SSE] Dodano klienta SSE. Aktualna liczba klientów: ${sseClients.length}`);
}

function removeSseClient(res) {
  const index = sseClients.indexOf(res);
  if (index !== -1) {
    sseClients.splice(index, 1);
    console.log(`👥 [SSE] Usunięto klienta SSE. Aktualna liczba klientów: ${sseClients.length}`);
  }
}

function notifySseClients(data) {
  if (sseClients.length === 0) return;
  
  console.log(`📨 [SSE] Wysyłanie danych do ${sseClients.length} klientów:`, data);
  sseClients.forEach((res, index) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error(`❌ [SSE] Błąd wysyłania do klienta ${index + 1}:`, error.message);
    }
  });
}

function createGrpcClient() {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });

  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
  return new protoDescriptor.hal.serial.Serial(GRPC_TARGET, grpc.credentials.createInsecure());
}

// === SERIAL CONFIG FUNCTIONS ===
function loadConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log(`📁 [CONFIG] Załadowano konfigurację: ${config.serial.path} @ ${config.serial.baudRate} baud`);
    return config;
  } catch (error) {
    console.error('❌ [CONFIG] Błąd ładowania konfiguracji:', error.message);
    // Domyślna konfiguracja
    const defaultConfig = {
      serial: {
        path: process.platform === 'win32' ? 'COM1' : '/dev/ttyUSB0',
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      }
    };
    console.log('🔄 [CONFIG] Używam domyślnej konfiguracji');
    return defaultConfig;
  }
}

function saveConfig(newConfig) {
  const nextConfig = newConfig?.serial ? newConfig : { serial: newConfig };
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2));
    console.log('💾 [CONFIG] Konfiguracja zapisana:', nextConfig.serial);
    restartSerial(); // apply config immediately
  } catch (error) {
    console.error('❌ [CONFIG] Błąd zapisywania konfiguracji:', error.message);
    throw error;
  }
}

// Funkcja do przetwarzania surowych danych - KAŻDA RAMKA OSOBNO
function processRawData(data) {
  const dataString = data.toString();
  
  // TRAKTUJ KAŻDĄ RAMKĘ JAKO OSOBNĄ WIADOMOŚĆ - NIE APPENDUJ DO BUFERU
  lastSerialData = dataString;
  
  console.log('📥 [SERIAL] Nowa ramka danych:', JSON.stringify(dataString));
  console.log('🔢 [SERIAL] Raw bytes:', Array.from(data));
  console.log('✅ [SERIAL] Zaktualizowano lastSerialData:', lastSerialData);
  
  // Powiadom SSE
  notifySseClients({ 
    data: dataString,
    rawBytes: Array.from(data),
    length: dataString.length,
    timestamp: new Date().toISOString(),
    type: 'raw_frame'
  });
  
  // Zapisz do logu
  fs.appendFile('serial.log', `${new Date().toISOString()} - FRAME: ${dataString}\n`, err => {
    if (err) console.error('❌ [SERIAL] Błąd zapisu logu:', err);
  });
}

// === SERIAL PORT FUNCTIONS ===
function startSerial() {
  const config = loadConfig().serial;

  if (serialPort && isPortOpen) {
    console.log('🔁 [SERIAL] Port już otwarty, zamykam...');
    stopSerial();
  }

  const invalidForWindows = process.platform === 'win32' && typeof config.path === 'string' && config.path.startsWith('/dev/');
  const invalidForUnix = process.platform !== 'win32' && typeof config.path === 'string' && /^COM\d+$/i.test(config.path);
  const missingPath = !config.path;

  if (missingPath || invalidForWindows || invalidForUnix) {
    console.warn(`⚠️ [SERIAL] Pomijam start portu szeregowego dla ścieżki "${config.path || '(brak)'}" na platformie ${process.platform}`);
    isPortOpen = false;
    lastSerialData = '';
    return;
  }

  console.log(`🔧 [SERIAL] Otwieranie portu: ${config.path}, Baud: ${config.baudRate}, DataBits: ${config.dataBits}, StopBits: ${config.stopBits}, Parity: ${config.parity}`);

  try {
    serialPort = new SerialPort({
      path: config.path,
      baudRate: config.baudRate,
      dataBits: config.dataBits,
      stopBits: config.stopBits,
      parity: config.parity,
      autoOpen: false
    });

    // Parser dla danych tekstowych z różnymi delimiterami
    parser = serialPort.pipe(new ReadlineParser({ 
      delimiter: '\r\n',
      encoding: 'utf8'
    }));

    // Obsługa danych przez parser (dla danych tekstowych z delimiterami)
    parser.on('data', data => {
      const trimmedData = data.trim();
      if (trimmedData) {
        lastSerialData = trimmedData;
        console.log('📝 [SERIAL] Odebrano dane (parser):', trimmedData);
        console.log('📊 [SERIAL] Długość danych:', trimmedData.length, 'znaków');

        // powiadom wszystkich klientów SSE
        notifySseClients({ 
          data: trimmedData,
          length: trimmedData.length,
          timestamp: new Date().toISOString(),
          type: 'parsed_frame'
        });

        // logowanie do pliku
        fs.appendFile('serial.log', `${new Date().toISOString()} - PARSED: ${trimmedData}\n`, err => {
          if (err) console.error('❌ [SERIAL] Błąd zapisu logu:', err);
        });
      }
    });

    // RAW data listener - główna obsługa danych (KAŻDA RAMKA OSOBNO)
    serialPort.on('data', (rawData) => {
      processRawData(rawData);
    });

    serialPort.open((err) => {
      if (err) {
        console.error('❌ [SERIAL] Błąd otwierania portu szeregowego:', err.message);
        isPortOpen = false;
        return;
      }
      console.log('✅ [SERIAL] Port szeregowy otwarty pomyślnie:', config.path);
      isPortOpen = true;
      
      // Testowe wysłanie danych po otwarciu portu
      setTimeout(() => {
        console.log('🧪 [SERIAL] Wysyłanie testowej wiadomości...');
        const testMessage = 'HELLO_SERIAL_TEST\n';
        serialPort.write(testMessage, (err) => {
          if (err) {
            console.error('❌ [SERIAL] Błąd wysyłania testu:', err.message);
          } else {
            console.log('✅ [SERIAL] Testowa wiadomość wysłana:', testMessage.trim());
          }
        });
      }, 2000);
    });

    serialPort.on('error', err => {
      console.error('❗ [SERIAL] Błąd portu szeregowego:', err.message);
      isPortOpen = false;
    });

    serialPort.on('close', () => {
      console.log('🔒 [SERIAL] Port szeregowy zamknięty');
      isPortOpen = false;
    });

    serialPort.on('drain', () => {
      console.log('💧 [SERIAL] Bufor wysyłania opróżniony');
    });

  } catch (error) {
    console.error('❌ [SERIAL] Krytyczny błąd inicjalizacji portu:', error.message);
    isPortOpen = false;
  }
}

function getLastSerialData() {
  return lastSerialData || 'Brak odebranych danych';
}

function getPortStatus() {
  return {
    isOpen: isPortOpen,
    lastData: lastSerialData,
    lastDataLength: lastSerialData ? lastSerialData.length : 0,
    sseClients: sseClients.length,
    timestamp: new Date().toISOString()
  };
}

function clearBuffer() {
  console.log('🗑️ [SERIAL] Czyszczenie ostatnich danych');
  lastSerialData = '';
}

function stopSerial() {
  if (serialPort) {
    serialPort.close((err) => {
      if (err) {
        console.error('❌ [SERIAL] Błąd zamykania portu:', err.message);
      } else {
        console.log('✅ [SERIAL] Port szeregowy zamknięty');
      }
      isPortOpen = false;
    });
  }
}

function restartSerial() {
  console.log('🔄 [SERIAL] Restartowanie portu szeregowego...');
  clearBuffer();
  stopSerial();
  setTimeout(startSerial, 1500); // większe opóźnienie dla pewności
}

function sendData(data) {
  console.log(`📤 [SERIAL] Próba wysłania danych: "${data}"`);
  
  if (!serialPort || !isPortOpen) {
    console.error('❌ [SERIAL] Port szeregowy nie jest otwarty!');
    return false;
  }

  // Dodaj znak nowej linii jeśli nie ma
  const dataToSend = data.endsWith('\n') ? data : data + '\n';
  let writeScheduled = true;
  
  try {
    serialPort.write(dataToSend, (err) => {
      if (err) {
        console.error('❌ [SERIAL] Błąd wysyłania danych:', err.message);
        return;
      }
      console.log('✅ [SERIAL] Dane wysłane pomyślnie:', data);
      
      // Powiadom SSE o wysłanych danych
      notifySseClients({
        sent: data,
        timestamp: new Date().toISOString(),
        type: 'sent'
      });
    });
  } catch (error) {
    console.error('❌ [SERIAL] Błąd inicjalizacji wysyłki:', error.message);
    writeScheduled = false;
  }

  return writeScheduled;
}

function readData() {
  return {
    lastData: lastSerialData,
    isPortOpen: isPortOpen,
    timestamp: new Date().toISOString()
  };
}

// Start serial automatically on app init
console.log('🚀 [SERIAL] Inicjalizacja modułu portu szeregowego...');
setTimeout(startSerial, 1000); // Opóźnione uruchomienie aby serwer mógł się w pełni zainicjalizować

function setMode(mode, metadata = new grpc.Metadata()) {
  console.log(`⚙️ [gRPC] Ustawianie trybu: ${mode}`);
  const client = createGrpcClient();
  return new Promise((resolve, reject) => {
    client.SetMode({ interfaceName: INTERFACE_NAME, mode }, metadata, (err, response) => {
      if (err) {
        console.error('❌ [gRPC] Błąd ustawiania trybu:', err.message);
        return reject(err);
      }
      console.log('✅ [gRPC] Tryb ustawiony pomyślnie');
      resolve(response);
    });
  });
}

function getMode(metadata = new grpc.Metadata()) {
  console.log('⚙️ [gRPC] Pobieranie trybu...');
  const client = createGrpcClient();
  return new Promise((resolve, reject) => {
    client.GetMode({ interfaceName: INTERFACE_NAME }, metadata, (err, response) => {
      if (err) {
        console.error('❌ [gRPC] Błąd pobierania trybu:', err.message);
        return reject(err);
      }
      console.log(`✅ [gRPC] Aktualny tryb: ${response.mode}`);
      resolve(response.mode);
    });
  });
}

function enableTermination(metadata = new grpc.Metadata()) {
  console.log('⚙️ [gRPC] Włączanie terminacji...');
  return setTermination(true, metadata);
}

function disableTermination(metadata = new grpc.Metadata()) {
  console.log('⚙️ [gRPC] Wyłączanie terminacji...');
  return setTermination(false, metadata);
}

function setTermination(enable, metadata = new grpc.Metadata()) {
  console.log(`⚙️ [gRPC] Ustawianie terminacji: ${enable}`);
  const client = createGrpcClient();
  return new Promise((resolve, reject) => {
    client.SetTermination({ interfaceName: INTERFACE_NAME, enableTermination: enable }, metadata, (err, response) => {
      if (err) {
        console.error('❌ [gRPC] Błąd ustawiania terminacji:', err.message);
        return reject(err);
      }
      console.log(`✅ [gRPC] Terminacja ustawiona na: ${enable}`);
      resolve(response);
    });
  });
}

function getTermination(metadata = new grpc.Metadata()) {
  console.log('⚙️ [gRPC] Pobieranie statusu terminacji...');
  const client = createGrpcClient();
  return new Promise((resolve, reject) => {
    client.GetTermination({ interfaceName: INTERFACE_NAME }, metadata, (err, response) => {
      if (err) {
        console.error('❌ [gRPC] Błąd pobierania terminacji:', err.message);
        return reject(err);
      }
      console.log(`✅ [gRPC] Status terminacji: ${response.terminationEnabled}`);
      resolve(response.terminationEnabled);
    });
  });
}

function getStatistics(metadata = new grpc.Metadata()) {
  console.log('📊 [gRPC] Pobieranie statystyk...');
  const client = createGrpcClient();
  return new Promise((resolve, reject) => {
    client.GetStatistics({ interfaceName: INTERFACE_NAME }, metadata, (err, response) => {
      if (err) {
        console.error('❌ [gRPC] Błąd pobierania statystyk:', err.message);
        return reject(err);
      }
      const stats = {
        txCount: parseInt(response.txCount) || 0,
        rxCount: parseInt(response.rxCount) || 0
      };
      console.log(`✅ [gRPC] Statystyki: TX=${stats.txCount}, RX=${stats.rxCount}`);
      resolve(stats);
    });
  });
}

function getAvailableModes(metadata = new grpc.Metadata()) {
  console.log('⚙️ [gRPC] Pobieranie dostępnych trybów...');
  const client = createGrpcClient();
  return new Promise((resolve, reject) => {
    client.GetAvailableModes({}, metadata, (err, response) => {
      if (err) {
        console.error('❌ [gRPC] Błąd pobierania trybów:', err.message);
        return reject(err);
      }
      let modes = [];
      if (Array.isArray(response.modes) && response.modes.some(m => m > 127)) {
        const modesStr = Buffer.from(response.modes).toString();
        modes = modesStr.split(',').filter(Boolean);
      } else {
        modes = response.modes || [];
      }
      console.log(`✅ [gRPC] Dostępne tryby: ${JSON.stringify(modes)}`);
      resolve(modes);
    });
  });
}

function getAvailableSlewRates(metadata = new grpc.Metadata()) {
  console.log('⚙️ [gRPC] Pobieranie dostępnych slew rates...');
  const client = createGrpcClient();
  return new Promise((resolve, reject) => {
    client.GetAvailableSlewRates({}, metadata, (err, response) => {
      if (err) {
        console.error('❌ [gRPC] Błąd pobierania slew rates:', err.message);
        return reject(err);
      }
      let rates = [];
      if (Array.isArray(response.slewRates) && response.slewRates.some(s => s > 127)) {
        const ratesStr = Buffer.from(response.slewRates).toString();
        rates = ratesStr.split(',').filter(Boolean);
      } else {
        rates = response.slewRates || [];
      }
      console.log(`✅ [gRPC] Dostępne slew rates: ${JSON.stringify(rates)}`);
      resolve(rates);
    });
  });
}

function getBaudRate(metadata = new grpc.Metadata()) {
  console.log('⚙️ [gRPC] Pobieranie baud rate...');
  const client = createGrpcClient();
  return new Promise((resolve, reject) => {
    client.GetBaudRate({ interfaceName: INTERFACE_NAME }, metadata, (err, response) => {
      if (err) {
        console.error('❌ [gRPC] Błąd pobierania baud rate:', err.message);
        return reject(err);
      }
      console.log(`✅ [gRPC] Baud rate: ${response.baudRate}`);
      resolve(response.baudRate);
    });
  });
}

function getSlewRate(metadata = new grpc.Metadata()) {
  console.log('⚙️ [gRPC] Pobieranie slew rate...');
  const client = createGrpcClient();
  return new Promise((resolve, reject) => {
    client.GetSlewRate({ interfaceName: INTERFACE_NAME }, metadata, (err, response) => {
      if (err) {
        if (err.code === grpc.status.UNIMPLEMENTED) {
          console.warn('⚠️ [gRPC] GetSlewRate nie zaimplementowany, zwracam wartość domyślną');
          return resolve(0);
        }
        console.error('❌ [gRPC] Błąd pobierania slew rate:', err.message);
        return reject(err);
      }
      console.log(`✅ [gRPC] Slew rate: ${response.slewRate}`);
      resolve(response.slewRate);
    });
  });
}

function setSlewRate(rate, metadata = new grpc.Metadata()) {
  console.log(`⚙️ [gRPC] Ustawianie slew rate: ${rate}`);
  const client = createGrpcClient();
  return new Promise((resolve, reject) => {
    client.SetSlewRate({ interfaceName: INTERFACE_NAME, slewRate: rate }, metadata, (err, response) => {
      if (err) {
        console.error('❌ [gRPC] Błąd ustawiania slew rate:', err.message);
        return reject(err);
      }
      console.log(`✅ [gRPC] Slew rate ustawiony na: ${rate}`);
      resolve(response);
    });
  });
}

function getTransceiverPower(metadata = new grpc.Metadata()) {
  console.log('⚡ [gRPC] Pobieranie statusu zasilania transceivera...');
  const client = createGrpcClient();
  return new Promise((resolve, reject) => {
    client.GetTransceiverPower({ interfaceName: INTERFACE_NAME }, metadata, (err, response) => {
      if (err) {
        console.error('❌ [gRPC] Błąd pobierania statusu zasilania:', err.message);
        return reject(err);
      }
      console.log(`✅ [gRPC] Zasilanie transceivera: ${response.powerOn}`);
      resolve(response.powerOn);
    });
  });
}

function setTransceiverPower(powerOn, metadata = new grpc.Metadata()) {
  console.log(`⚡ [gRPC] Ustawianie zasilania transceivera: ${powerOn}`);
  const client = createGrpcClient();
  return new Promise((resolve, reject) => {
    client.SetTransceiverPower({ interfaceName: INTERFACE_NAME, powerOn }, metadata, (err, response) => {
      if (err) {
        console.error('❌ [gRPC] Błąd ustawiania zasilania:', err.message);
        return reject(err);
      }
      console.log(`✅ [gRPC] Zasilanie transceivera ustawione na: ${powerOn}`);
      resolve(response);
    });
  });
}

function listInterfaces(includeDetails = false, metadata = new grpc.Metadata()) {
  console.log('🔍 [gRPC] Listowanie interfejsów...');
  const client = createGrpcClient();
  return new Promise((resolve, reject) => {
    client.ListInterfaces({ includeDetails }, metadata, (err, response) => {
      if (err) {
        console.error('❌ [gRPC] Błąd listowania interfejsów:', err.message);
        console.log('🔄 [gRPC] Zwracam domyślny interfejs');
        return resolve([{
          name: INTERFACE_NAME,
          currentMode: 1,
          terminationEnabled: true,
          baudRate: 9600,
          slewRate: 0,
          transceiverPower: true
        }]);
      }
      console.log(`✅ [gRPC] Znaleziono ${response.interfaces?.length || 0} interfejsów`);
      resolve(response.interfaces || []);
    });
  });
}

async function checkStatus(metadata = new grpc.Metadata()) {
  console.log('🔍 [gRPC] Sprawdzanie statusu...');
  try {
    const results = await Promise.allSettled([
      getMode(metadata),
      getTermination(metadata),
      getStatistics(metadata),
      getBaudRate(metadata).catch(() => null),
      getSlewRate(metadata).catch(() => null),
      getTransceiverPower(metadata).catch(() => null)
    ]);

    const status = {
      mode: results[0].value,
      termination: results[1].value,
      stats: results[2].value,
      baudRate: results[3].value || 'N/A',
      slewRate: results[4].value || 'N/A',
      transceiverPower: results[5].value !== null ? results[5].value : 'N/A',
      portStatus: getPortStatus()
    };

    console.log('✅ [gRPC] Status sprawdzony pomyślnie');
    return status;
  } catch (err) {
    console.error('❌ [gRPC] Błąd sprawdzania statusu:', err);
    throw err;
  }
}

async function listAvailablePorts() {
  const ports = await SerialPort.list();
  const mappedPorts = ports.map((port) => ({
    path: port.path,
    manufacturer: port.manufacturer || '',
    serialNumber: port.serialNumber || '',
    pnpId: port.pnpId || '',
    vendorId: port.vendorId || '',
    productId: port.productId || '',
    friendlyName: [port.path, port.manufacturer].filter(Boolean).join(' - '),
  }));

  if (process.platform !== 'linux') {
    return mappedPorts;
  }

  const activeLinuxTtys = getActiveLinuxSerialPorts();
  if (!activeLinuxTtys.size) {
    return mappedPorts;
  }

  return mappedPorts.filter((port) => {
    if (!port.path.startsWith('/dev/ttyS')) {
      return true;
    }

    return activeLinuxTtys.has(path.basename(port.path));
  });
}

function getActiveLinuxSerialPorts() {
  try {
    const serialInfo = fs.readFileSync('/proc/tty/driver/serial', 'utf8');
    const activePorts = new Set();

    for (const line of serialInfo.split('\n')) {
      const match = line.match(/^(\d+):\s+uart:([^\s]+)/);
      if (!match) {
        continue;
      }

      const [, index, uartType] = match;
      if (!uartType || uartType.toLowerCase() === 'unknown') {
        continue;
      }

      activePorts.add(`ttyS${index}`);
    }

    return activePorts;
  } catch (error) {
    console.warn('⚠️ [SERIAL] Nie udało się odczytać aktywnych portów z /proc/tty/driver/serial:', error.message);
    return new Set();
  }
}

async function getRuntimeInfo() {
  return {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    hostname: os.hostname(),
    serialPorts: await listAvailablePorts(),
    currentConfig: loadConfig().serial,
  };
}

module.exports = {
  loadConfig,
  saveConfig,
  sendData,
  readData,
  startSerial,
  stopSerial,
  restartSerial,
  setMode,
  getMode,
  enableTermination,
  disableTermination,
  setTermination,
  getTermination,
  getStatistics,
  getAvailableModes,
  getAvailableSlewRates,
  getBaudRate,
  getSlewRate,
  setSlewRate,
  getTransceiverPower,
  setTransceiverPower,
  listInterfaces,
  checkStatus,
  getLastSerialData,
  getPortStatus,
  clearBuffer,
  listAvailablePorts,
  getRuntimeInfo,
  // DODANE FUNKCJE SSE:
  addSseClient,
  removeSseClient,
  notifySseClients
};
