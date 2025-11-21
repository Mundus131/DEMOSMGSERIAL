const fs = require('fs').promises;
const path = require('path');

const LOG_PATHS = {
  codes: path.join(__dirname, '../data/logs/codes.jsonl'),
  states: path.join(__dirname, '../data/logs/states.jsonl'),
  weights: path.join(__dirname, '../data/logs/weights.jsonl'),
  dataFrames: path.join(__dirname, '../data/logs/dataFrames.jsonl')
};

const queues = {
  codes: [],
  states: [],
  weights: [],
  dataFrames: []
};

let writing = {
  codes: false,
  states: false,
  weights: false,
  dataFrames: false
};

async function ensureFileExists(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, '', 'utf8');
  }
}

async function enqueueWrite(type, data) {
  if (!queues[type]) {
    console.error(`Unknown log type: ${type}`);
    return Promise.reject(`Unknown log type: ${type}`);
  }

  return new Promise((resolve, reject) => {
    queues[type].push({ data, resolve, reject });
    processQueue(type);
  });
}

async function processQueue(type) {
  if (writing[type] || queues[type].length === 0) return;

  writing[type] = true;
  const { data, resolve, reject } = queues[type].shift();

  try {
    await ensureFileExists(LOG_PATHS[type]);
    const jsonLine = JSON.stringify(data) + '\n';
    await fs.appendFile(LOG_PATHS[type], jsonLine, 'utf8');
    resolve();
  } catch (err) {
    console.error(`[logger] Error writing ${type}:`, err);
    reject(err);
  } finally {
    writing[type] = false;
    setImmediate(() => processQueue(type));
  }
}

// Funkcje logujące
async function logDataFrame(direction, data, clientInfo = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    direction,
    data: data.toString().trim(),
    client: clientInfo ? `${clientInfo.address}:${clientInfo.port}` : 'N/A'
  };
  return enqueueWrite('dataFrames', entry);
}

async function logCode(code) {
  const entry = {
    timestamp: new Date().toISOString(),
    code: code.toString().trim()
  };
  return enqueueWrite('codes', entry);
}

async function logState(message) {
  // Parsuj źródło z wiadomości np. "[PLC] Błąd połączenia"
  const sourceMatch = message.match(/^\[([^\]]+)\]/);
  const source = sourceMatch ? sourceMatch[1] : '';
  const cleanMessage = sourceMatch ? message.replace(/^\[[^\]]+\]\s*/, '') : message;

  const entry = {
    timestamp: new Date().toISOString(),
    source,
    message: cleanMessage.trim()
  };
  return enqueueWrite('states', entry);
}

async function logWeight(weight) {
  const entry = {
    timestamp: new Date().toISOString(),
    weight: weight.toString().trim()
  };
  return enqueueWrite('weights', entry);
}

/**
 * Pomocnicza funkcja do odczytu plików JSONL
 */
async function readJsonlFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

module.exports = {
  logCode,
  logState,
  logWeight,
  logDataFrame,
  LOG_PATHS,
  readJsonlFile
};