const EventEmitter = require('events');
const configWatcher = require('./configWatcher');
const { logState, logDataFrame } = require('./logger');
const config  = require('../data/configuration/configuration.json');
const { digitalIOManager } = require('./digitalio');
const { decodeControlSequences } = require('./utils');
const MultiLectorController = require('./multiLector');
const rsSender = require('./rsSender');
const fs = require('fs');
const path = require('path');
console.log(config.lectory)
const lectorController = new MultiLectorController(config.lectory, 2112);

function countValidCodes(results) {
  const { przód, tył, lewy, prawy } = results;
  let count = 0;
  
  // Zlicz lewy bok
  for (const code of lewy) {
    if (code && code !== 'NoRead' && code !== 'NORREAD') {
      count++;
    }
  }
  
  // Zlicz prawy bok
  for (const code of prawy) {
    if (code && code !== 'NoRead' && code !== 'NORREAD') {
      count++;
    }
  }
  
  // Zlicz przód (jeśli nie jest NoRead)
  if (przód.length > 0 && przód[0] !== 'NoRead' && przód[0] !== 'NORREAD') {
    count++;
  }
  
  // Zlicz tył (jeśli nie jest NoRead)
  if (tył.length > 0 && tył[0] !== 'NoRead' && tył[0] !== 'NORREAD') {
    count++;
  }
  
  return count;
}

function analyzeScenarioWithDuplicates(results) {
  const { przód, tył, lewy, prawy } = results;
  const validCodesCount = countValidCodes(results);
  
  // Znajdź wszystkie kody z lewego i prawego
  const leftValidCodes = lewy.filter(code => code && code !== 'NoRead' && code !== 'NORREAD');
  const rightValidCodes = prawy.filter(code => code && code !== 'NoRead' && code !== 'NORREAD');
  const sideCodes = [...leftValidCodes, ...rightValidCodes];
  
  // Sprawdź duplikaty w przodzie
  const przodValidCodes = przód.filter(code => code && code !== 'NoRead' && code !== 'NORREAD');
  const przodDuplicates = przodValidCodes.filter(code => sideCodes.includes(code));
  
  // Sprawdź duplikaty w tyle
  const tylValidCodes = tył.filter(code => code && code !== 'NoRead' && code !== 'NORREAD');
  const tylDuplicates = tylValidCodes.filter(code => sideCodes.includes(code));
  
  const hasDuplicates = przodDuplicates.length > 0 || tylDuplicates.length > 0;
  
  // Zlicz unikalne kody
  const allCodes = [...lewy, ...prawy, ...przód, ...tył];
  const uniqueCodes = [...new Set(allCodes.filter(code => 
    code && code !== 'NoRead' && code !== 'NORREAD'
  ))];
  
  // Określ typ scenariusza
  let scenarioType = null;
  let isValid = false;
  
  // Scenariusz 1: 4-kodowy (lewy/prawy po 2, przód/tył = NoRead)
  if (lewy.length === 2 && prawy.length === 2 &&
      przód[0] === 'NoRead' && tył[0] === 'NoRead') {
    scenarioType = 'scenario1';
    isValid = validCodesCount === 4;
  }
  // Scenariusz 2: 6-kodowy (lewy/prawy po 2, przód/tył po jednym poprawnym)
  else if (lewy.length === 2 && prawy.length === 2 &&
           przód.length === 1 && przód[0] !== 'NoRead' &&
           tył.length === 1 && tył[0] !== 'NoRead') {
    scenarioType = 'scenario2';
    isValid = validCodesCount === 6;
  }
  // Mieszany scenariusz - jakiekolwiek duplikaty
  else if (lewy.length === 2 && prawy.length === 2 && hasDuplicates) {
    scenarioType = 'mixed_4code';
    // Jeśli mamy 4 unikalne kody, to OK (nawet jeśli przód/tył mają duplikaty)
    const uniqueSideCodes = new Set([...leftValidCodes, ...rightValidCodes]);
    isValid = uniqueSideCodes.size === 4;
  }
  
  return {
    scenarioType,
    isValid,
    validCodesCount,
    uniqueCodesCount: uniqueCodes.length,
    expectedCount: scenarioType === 'scenario1' || scenarioType === 'mixed_4code' ? 4 : 
                   scenarioType === 'scenario2' ? 6 : 0,
    hasDuplicates,
    duplicates: {
      przod: przodDuplicates,
      tyl: tylDuplicates,
      total: przodDuplicates.length + tylDuplicates.length
    },
    codesSummary: {
      left: leftValidCodes,
      right: rightValidCodes,
      front: przodValidCodes,
      back: tylValidCodes
    }
  };
}



function extractCodesForScenario(results, scenarioAnalysis) {
  const codes = [];
  const seenCodes = new Set();
  
  // Zawsze sprawdzaj duplikaty z lewego i prawego
  const leftCodes = results.lewy || [];
  const rightCodes = results.prawy || [];
  const frontCodes = results.przód || [];
  const backCodes = results.tył || [];
  
  // Najpierw dodaj lewy bok (pełna kontrola)
  for (const code of leftCodes) {
    if (code && code !== 'NoRead' && code !== 'NORREAD' && !seenCodes.has(code)) {
      codes.push(code);
      seenCodes.add(code);
      console.log(`[TDC] Dodano kod ${code} z lewy`);
    }
  }
  
  // Potem prawy bok
  for (const code of rightCodes) {
    if (code && code !== 'NoRead' && code !== 'NORREAD' && !seenCodes.has(code)) {
      codes.push(code);
      seenCodes.add(code);
      console.log(`[TDC] Dodano kod ${code} z prawy`);
    }
  }
  
  // PRZÓD - sprawdzaj czy kod jest już w lewym/prawym
  for (const code of frontCodes) {
    if (code && code !== 'NoRead' && code !== 'NORREAD') {
      if (!seenCodes.has(code)) {
        codes.push(code);
        seenCodes.add(code);
        console.log(`[TDC] Dodano kod ${code} z przód`);
      } else {
        console.log(`[TDC] Pominięto duplikat ${code} z przód (już w lewym/prawym)`);
      }
    }
  }
  
  // TYŁ - sprawdzaj czy kod jest już w lewym/prawym
  for (const code of backCodes) {
    if (code && code !== 'NoRead' && code !== 'NORREAD') {
      if (!seenCodes.has(code)) {
        codes.push(code);
        seenCodes.add(code);
        console.log(`[TDC] Dodano kod ${code} z tył`);
      } else {
        console.log(`[TDC] Pominięto duplikat ${code} z tył (już w lewym/prawym/przód)`);
      }
    }
  }
  
  console.log(`[TDC] Wyekstrahowano ${codes.length} unikalnych kodów do wysłania: ${codes}`);
  return codes;
}


// Ulepszona funkcja checkScenario zwracająca szczegóły
function analyzeScenario(results) {
  const { przód, tył, lewy, prawy } = results;
  const validCodesCount = countValidCodes(results);
  
  // Określ typ scenariusza
  let scenarioType = null;
  let isValid = false;
  
  // Scenariusz 1: 4-kodowy (lewy/prawy po 2, przód/tył = NoRead)
  if (lewy.length === 2 && prawy.length === 2 &&
      przód[0] === 'NoRead' && tył[0] === 'NoRead') {
    scenarioType = 'scenario1'; // 4-kodowy
    isValid = validCodesCount === 4;
  }
  // Scenariusz 2: 6-kodowy (lewy/prawy po 2, przód/tył po jednym poprawnym)
  else if (lewy.length === 2 && prawy.length === 2 &&
           przód.length === 1 && przód[0] !== 'NoRead' &&
           tył.length === 1 && tył[0] !== 'NoRead') {
    scenarioType = 'scenario2'; // 6-kodowy
    isValid = validCodesCount === 6;
  }
  
  return {
    scenarioType,
    isValid,
    validCodesCount,
    expectedCount: scenarioType === 'scenario1' ? 4 : scenarioType === 'scenario2' ? 6 : 0
  };
}

function checkScenario(data) {
  const { przód, tył, lewy, prawy } = data;

  // Scenariusz 1: lewy/prawy po 2 elementy, przód/tył = NoRead
  if (lewy.length === 2 && prawy.length === 2 &&
      przód[0] === 'NoRead' && tył[0] === 'NoRead') {
    return true;
  }

  // Scenariusz 2: lewy/prawy po 2 elementy, przód/tył po jednym obiekcie
  if (lewy.length === 2 && prawy.length === 2 &&
      przód.length === 1 && przód[0] !== 'NoRead' &&
      tył.length === 1 && tył[0] !== 'NoRead') {
    return true;
  }

  return false;
}

async function setDigitalOutputsForAnalysis(analysis) {
  const { scenarioType, isValid, validCodesCount } = analysis;
  
  // Ustaw kierunki dla wszystkich wyjść
  const outputPins = ['DIO_A', 'DIO_B', 'DIO_C', 'DIO_D'];
  for (const pin of outputPins) {
    digitalIOManager.setDirection(pin, "OUT");
  }
  
  // DIO_A - wszystkie kody odczytane poprawnie (4 lub 6)
  await digitalIOManager.write("DIO_A", isValid ? "HIGH" : "LOW");
  
  // DIO_B - niepełny odczyt (0-3 lub 5 kodów)
  const isIncomplete = !isValid && validCodesCount > 0 && 
                       ((scenarioType === 'scenario1' && validCodesCount < 4) ||
                        (scenarioType === 'scenario2' && validCodesCount < 6));
  await digitalIOManager.write("DIO_B", isIncomplete ? "HIGH" : "LOW");
  
  // DIO_C - wariant 4-kodowy (scenariusz 1)
  await digitalIOManager.write("DIO_C", scenarioType === 'scenario1' ? "HIGH" : "LOW");
  
  // DIO_D - wariant 6-kodowy (scenariusz 2)
  await digitalIOManager.write("DIO_D", scenarioType === 'scenario2' ? "HIGH" : "LOW");
  
  console.log(`[TDC] Ustawione wyjścia:`);
  console.log(`  DIO_A (kompletny): ${isValid ? 'HIGH' : 'LOW'}`);
  console.log(`  DIO_B (niepełny): ${isIncomplete ? 'HIGH' : 'LOW'}`);
  console.log(`  DIO_C (4-kodowy): ${scenarioType === 'scenario1' ? 'HIGH' : 'LOW'}`);
  console.log(`  DIO_D (6-kodowy): ${scenarioType === 'scenario2' ? 'HIGH' : 'LOW'}`);
  console.log(`  Odczytanych kodów: ${validCodesCount}/${analysis.expectedCount || '?'}`);
}


// Funkcja pomocnicza do ekstrakcji kodów z wyników
function extractCodesFromResults(results) {
  const codes = [];
  const seenCodes = new Set(); // Do śledzenia duplikatów
  
  // Definiujemy priorytet lektorów (w kolejności od najważniejszych)
  const lectorPriority = ['lewy', 'prawy', 'przód', 'tył'];
  
  // Najpierw zbierz wszystkie kody z zachowaniem priorytetu
  for (const lectorName of lectorPriority) {
    if (results[lectorName] && Array.isArray(results[lectorName])) {
      for (const code of results[lectorName]) {
        if (code && code !== 'NoRead' && code !== 'NORREAD') {
          // Jeśli kod nie został jeszcze dodany, dodaj go
          if (!seenCodes.has(code)) {
            codes.push(code);
            seenCodes.add(code);
            console.log(`[TDC] Dodano kod ${code} z ${lectorName}`);
          } else {
            console.log(`[TDC] Pominięto duplikat ${code} z ${lectorName} (już odczytany wcześniej)`);
          }
        }
      }
    }
  }
  
  console.log(`[TDC] Wyekstrahowano unikalne kody do wysłania: ${codes}`);
  return codes;
}

// Zapis wyniku wysyłki RS
async function saveRSSendResult(sendResult, originalResults) {
  const resultData = {
    timestamp: new Date().toISOString(),
    originalResults: originalResults,
    rsSendResult: sendResult,
    success: sendResult.failed === 0
  };
  
  try {
    const resultsFile = path.join(__dirname, 'rs_send_results.json');
    let allResults = [];
    
    if (fs.existsSync(resultsFile)) {
      const existingData = fs.readFileSync(resultsFile, 'utf8');
      allResults = JSON.parse(existingData);
    }
    
    allResults.push(resultData);
    fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));
    
    console.log('[TDC] Zapisano wynik wysyłki RS do pliku');
  } catch (error) {
    console.error('[TDC] Błąd zapisu wyniku wysyłki RS:', error);
  }
}

lectorController.startAll();
const resultsFile = path.join(__dirname, 'results.json');

// event po zakończeniu cyklu
lectorController.on('cycleCompleted', async ({ success, results }) => {
  console.log('===> Wyniki cyklu:', JSON.stringify(results, null, 2));
  
  // Analizuj scenariusz z wykrywaniem duplikatów
  const analysis = analyzeScenarioWithDuplicates(results);
  console.log(`[TDC] Analiza:`);
  console.log(`  Typ scenariusza: ${analysis.scenarioType || 'brak'}`);
  console.log(`  Poprawny: ${analysis.isValid}`);
  console.log(`  Odczytanych kodów: ${analysis.validCodesCount}/${analysis.expectedCount || 'N/A'}`);
  if (analysis.hasDuplicates) {
    console.log(`  Duplikaty: przód=${analysis.duplicates.przod}, tył=${analysis.duplicates.tyl}`);
  }
  
  // Ustaw wyjścia cyfrowe
  await setDigitalOutputsForAnalysis(analysis);
  
  // Wysyłka RS jeśli jest przynajmniej 1 kod
  if (analysis.validCodesCount > 0) {
    try {
      const codesToSend = extractCodesForScenario(results, analysis);
      
      if (codesToSend.length > 0) {
        // Określ typ wysyłki
        let sendType = '';
        if (analysis.scenarioType && analysis.isValid) {
          sendType = `scenariusz ${analysis.scenarioType}`;
        } else if (analysis.validCodesCount === 1) {
          sendType = 'pojedynczy kod';
        } else if (analysis.validCodesCount >= 2 && analysis.validCodesCount <= 3) {
          sendType = `częściowy odczyt (${analysis.validCodesCount} kody)`;
        } else if (analysis.validCodesCount === 5) {
          sendType = `5 kodów (prawie komplet)`;
        }
        
        console.log(`[TDC] Rozpoczynanie wysyłki ${codesToSend.length} kodów przez RS (${sendType})`);
        
        // Dodaj informację o duplikatach do logowania
        if (analysis.hasDuplicates) {
          await logState(`[TDC] Wykryto duplikaty: przód=${analysis.duplicates.przod}, tył=${analysis.duplicates.tyl}`);
        }
        
        await logState(`[TDC] Wysyłam ${codesToSend.length} kodów: ${codesToSend.join(', ')}`);
        
        const sendResult = await rsSender.sendCodes(codesToSend);
        console.log('[TDC] Wynik wysyłki RS:', sendResult);
        
        // Zapis wyniku wysyłki z informacją o duplikatach
        const enhancedSendResult = {
          ...sendResult,
          scenarioType: analysis.scenarioType || 'partial_read',
          partialRead: !analysis.scenarioType || !analysis.isValid,
          validCodesCount: analysis.validCodesCount,
          hasDuplicates: analysis.hasDuplicates,
          duplicates: analysis.duplicates,
          codesSent: codesToSend
        };
        
        await saveRSSendResult(enhancedSendResult, results);
      } else {
        console.log(`[TDC] Brak kodów do wysłania przez RS`);
        await logState('[TDC] Brak kodów do wysłania przez RS');
      }
    } catch (error) {
      console.error('[TDC] Błąd wysyłki RS:', error);
      await logState(`[TDC] Błąd wysyłki RS: ${error.message}`);
    }
  } else {
    console.log(`[TDC] Nie wysyłam RS - brak kodów`);
    await logState(`[TDC] Nie wysyłam RS - brak kodów`);
  }
});

class TDCController extends EventEmitter {
  constructor() {
    super();
    this.currentCycle = null;
    this.defaultConfig = {
      sendIncompleteData: true,
      cycleTimeout: 5000,
      maxRetries: 3,
      waitForBoth: false,
      outputStringFormat: {
        start: "<STX>",
        stop: "<ETX>",
        separator: ","
      }
    };
    this.config = { ...this.defaultConfig };
    this.cleanupConfigWatcher = null;
    this.digitalMonitoringActive = false;
    this.previousDigitalStates = {};
    this.monitoringInterval = null;
  }

  async initialize() {
    await this.updateConfig(configWatcher.lastConfig?.tdc);
    this.watchConfigurationChanges();
    await logState('[TDC] Inicjalizacja kontrolera TDC');
    this.resetCycle();
    await this.startDigitalMonitoring();
  }

  async startDigitalMonitoring() {
    if (this.digitalMonitoringActive) {
      await this.stopDigitalMonitoring();
    }

    this.digitalMonitoringActive = true;
    const pinName = 'DI_A';
    const checkIntervalMs = 50;
    digitalIOManager.setDirection('DIO_A',"OUT")
    await logState(`[TDC] Rozpoczynam monitorowanie ${pinName} co ${checkIntervalMs}ms`);

    try {
      // Inicjalizacja stanu
      const initialState = await digitalIOManager.read(pinName);
      this.previousDigitalStates[pinName] = initialState;
      await logState(`[TDC] Stan początkowy ${pinName}: ${initialState}`);
    } catch (error) {
      await logState(`[TDC] Błąd odczytu stanu początkowego ${pinName}: ${error.message}`);
      this.previousDigitalStates[pinName] = 'LOW'; // Domyślny stan
    }

    const monitorLoop = async () => {
      if (!this.digitalMonitoringActive) return;

      try {
        const currentState = await digitalIOManager.read(pinName);
        const previousState = this.previousDigitalStates[pinName];

        // Detekcja zbocza narastającego (LOW -> HIGH)
        if (previousState === 'LOW' && currentState === 'HIGH') {
          await logState(`[TDC] Zbocze narastające na ${pinName} - wyzwalanie cyklu`);
          await this.startCycle(`digital-read:${pinName}`);
        }

        this.previousDigitalStates[pinName] = currentState;
      } catch (error) {
        await logState(`[TDC] Błąd monitorowania ${pinName}: ${error.message}`);
      }

      // Kontynuacja monitorowania
      if (this.digitalMonitoringActive) {
        this.monitoringInterval = setTimeout(monitorLoop, checkIntervalMs);
      }
    };

    // Uruchomienie pętli monitorowania
    this.monitoringInterval = setTimeout(monitorLoop, checkIntervalMs);
  }

  async stopDigitalMonitoring() {
    this.digitalMonitoringActive = false;
    if (this.monitoringInterval) {
      clearTimeout(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    await logState('[TDC] Zatrzymano monitorowanie digital IO');
  }

  async updateConfig(newConfig) {
    if (!newConfig) return;

    console.log('[TDC DEBUG] Otrzymana konfiguracja TDC:', JSON.stringify(newConfig, null, 2));
    console.log('[TDC DEBUG] Pełna konfiguracja systemu:', JSON.stringify(configWatcher.lastConfig, null, 2));

    const oldConfig = JSON.parse(JSON.stringify(this.config));
    const changes = [];

    // Pobierz outputStringFormat z sekcji tdc lub z głównego poziomu
    const outputFormatConfig = newConfig.outputStringFormat 
        || (configWatcher.lastConfig && configWatcher.lastConfig.outputStringFormat);

    // Aktualizacja podstawowych parametrów
    ['cycleTimeout', 'maxRetries', 'waitForBoth', 'sendIncompleteData'].forEach(key => {
        if (newConfig[key] !== undefined && newConfig[key] !== this.config[key]) {
            changes.push(`${key}: ${this.config[key]} → ${newConfig[key]}`);
            this.config[key] = newConfig[key];
        }
    });

    // Aktualizacja formatu wyjściowego
    if (outputFormatConfig) {
        const newFormat = {
            start: outputFormatConfig.start !== undefined 
                ? outputFormatConfig.start 
                : this.config.outputStringFormat.start,
            stop: outputFormatConfig.stop !== undefined 
                ? outputFormatConfig.stop 
                : this.config.outputStringFormat.stop,
            separator: outputFormatConfig.separator !== undefined 
                ? outputFormatConfig.separator 
                : this.config.outputStringFormat.separator
        };

        // Sprawdź i zarejestruj zmiany
        if (newFormat.start !== oldConfig.outputStringFormat.start) {
            changes.push(`start: ${oldConfig.outputStringFormat.start} → ${newFormat.start}`);
        }
        if (newFormat.stop !== oldConfig.outputStringFormat.stop) {
            changes.push(`stop: ${oldConfig.outputStringFormat.stop} → ${newFormat.stop}`);
        }
        if (newFormat.separator !== oldConfig.outputStringFormat.separator) {
            changes.push(`separator: ${oldConfig.outputStringFormat.separator} → ${newFormat.separator}`);
        }

        // Nadpisz cały obiekt
        this.config.outputStringFormat = newFormat;
    }

    console.log('[TDC DEBUG] Konfiguracja po zmianach:', JSON.stringify(this.config, null, 2));

    if (changes.length > 0) {
        await logState(`[TDC] Zmiana konfiguracji: ${changes.join(', ')}`);
        
        if (changes.some(c => c.includes('separator'))) {
            console.log('[TDC DEBUG] Potwierdzona zmiana separatora:', this.config.outputStringFormat.separator);
        }
    }
  }

  watchConfigurationChanges() {
    if (this.cleanupConfigWatcher) {
        this.cleanupConfigWatcher();
    }

    const handleChange = (config) => {
        console.log('[TDC DEBUG] Otrzymana konfiguracja:', JSON.stringify(config, null, 2));
        if (config) {
            console.log('[TDC] Wykryto zmianę konfiguracji TDC, aktualizowanie...');
            this.updateConfig(config);
        }
    };

    configWatcher.on('tdcConfigChanged', handleChange);
    
    this.cleanupConfigWatcher = () => {
        configWatcher.off('tdcConfigChanged', handleChange);
    };
  }

  async cleanup() {
    await this.stopDigitalMonitoring();
    
    if (this.cleanupConfigWatcher) {
      this.cleanupConfigWatcher();
      this.cleanupConfigWatcher = null;
    }
    
    this.resetCycle();
    await logState('[TDC] Wyczyszczono zasoby TDC');
  }

async startCycle() {
  console.log('[TDC] Start cyklu');
   lectorController.startCycle();
  // tu trzymamy wyniki z lektorów
  this.currentCycle = {
    active: true,
    received: {}
  };

  // ustaw timeout (np. 5s), żeby nie wisiało w nieskończoność
  this.currentCycle.timeout = setTimeout(() => {
    console.log('[TDC] Timeout cyklu – nie wszystkie lectory odpowiedziały');
    this.finishCycle();
  }, this.config.cycleTimeout || 5000);
}

// wywoływane, gdy któryś lector przyśle ramkę
onLectorFrame(name, data) {
  if (!this.currentCycle?.active) return;

  this.currentCycle.received[name] = data;

  const expected = Object.keys(this.config.lectory).length;
  const received = Object.keys(this.currentCycle.received).length;

  if (received === expected) {
    this.finishCycle();
  }
}

finishCycle() {
  if (!this.currentCycle?.active) return;
  clearTimeout(this.currentCycle.timeout);

  console.log('[TDC] CYKL ZAKOŃCZONY. Odczytane kody:');
  console.log(this.currentCycle.received);

  this.currentCycle.active = false;
}

  async handleCodeData(codeData) {
    if (!this.currentCycle?.active || this.currentCycle.completed) {
      await logState('[TDC] Otrzymano kod poza aktywnym cyklem - ignorowanie');
      return;
    }

    if (this.currentCycle.received.code) {
      await logState('[TDC] Otrzymano kolejny kod w tym samym cyklu - ignorowanie');
      return;
    }

    this.currentCycle.received.code = {
      code: codeData.code,
      timestamp: codeData.timestamp || new Date().toISOString()
    };

    await logState(`[TDC] Zarejestrowano kod: ${codeData.code}`);
    await this.checkCycleCompletion();
  }

  async handleLectorFrame(name, data) {
  if (!this.currentCycle?.active || this.currentCycle.completed) return;

  this.currentCycle.received.lectors[name] = data;

  await logState(`[TDC] Odebrano ramkę od lectora ${name}: ${JSON.stringify(data)}`);

  // sprawdzamy czy mamy komplet odpowiedzi
  const expected = Object.keys(this.config.lectory).length;
  const received = Object.keys(this.currentCycle.received.lectors).length;

  if (received === expected) {
    await this.completeCycle(true);
  }
}

  async handleWeightData(weightData) {
    if (!this.currentCycle?.active || this.currentCycle.completed) {
      await logState('[TDC] Otrzymano wagę poza aktywnym cyklem - ignorowanie');
      return;
    }

    if (this.currentCycle.received.weight) {
      await logState('[TDC] Otrzymano kolejną wagę w tym samym cyklu - ignorowanie');
      return;
    }

    this.currentCycle.received.weight = {
      weight: weightData.weight,
      timestamp: weightData.timestamp || new Date().toISOString()
    };

    await logState(`[TDC] Zarejestrowano wagę: ${weightData.weight}`);
    await this.checkCycleCompletion();
  }

  async checkCycleCompletion() {
    if (!this.currentCycle?.active || this.currentCycle.completed) return;

    const { code, weight } = this.currentCycle.received;
    const bothReceived = code && weight;
    
    if (this.config.waitForBoth) {
      if (bothReceived) {
        await this.completeCycle(true);
      }
    } else if (code || weight) {
      await this.completeCycle(bothReceived);
    }
  }

  async completeCycle(success) {
    if (!this.currentCycle || this.currentCycle.completed) return;
    
    this.currentCycle.completed = true;
    clearTimeout(this.currentCycle.timeout);

    console.log("CYKL POSZEDŁ")
    
    this.emit('cycleCompleted', {
      success,
    });

    await logState(`[TDC] Zakończono cykl ${success ? 'pomyślnie' : 'z błędami'}`);
    setTimeout(() => this.resetCycle(), 100);
  }

  async handleTimeout() {
    if (!this.currentCycle?.active || this.currentCycle.completed) return;

    await logState('[TDC] Timeout - zakończenie cyklu z niekompletnymi danymi');
    await this.completeCycle(false);
  }

  resetCycle() {
    if (this.currentCycle?.timeout) {
      clearTimeout(this.currentCycle.timeout);
    }

    this.currentCycle = {
      active: false,
      triggerTime: null,
      triggerSource: null,
      received: {
        code: null,
        weight: null
      },
      completed: false,
      timeout: null,
      plcSent: false,
      plcError: null
    };
  }

  setup(app) {
    app.post('/api/tdc/trigger', async (req, res) => {
      try {
        const triggered = await this.startCycle('api');
        res.json({
          success: triggered,
          message: triggered ? 'Rozpoczęto nowy cykl' : 'Cykl już aktywny - ignorowanie'
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: err.message
        });
      }
    });

    app.get('/api/tdc/status', (req, res) => {
      res.json(this.getStatus());
    });

    app.get('/api/tdc/config', (req, res) => {
      res.json(this.config);
    });

    app.post('/api/tdc/digital-monitoring/start', async (req, res) => {
      try {
        await this.startDigitalMonitoring();
        res.json({ success: true, message: 'Monitorowanie digital IO uruchomione' });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.post('/api/tdc/digital-monitoring/stop', async (req, res) => {
      try {
        await this.stopDigitalMonitoring();
        res.json({ success: true, message: 'Monitorowanie digital IO zatrzymane' });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.get('/api/tdc/results/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const historyFile = path.join(__dirname, 'results_history.json');
    
    if (!fs.existsSync(historyFile)) {
      return res.json({ success: true, history: [], total: 0 });
    }
    
    const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    
    // Ogranicz do żądanej liczby
    const limitedData = data.slice(0, limit);
    
    res.json({
      success: true,
      history: limitedData,
      total: data.length,
      hasDuplicates: limitedData.some(item => item.analysis?.hasDuplicates)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint do statystyk duplikatów
app.get('/api/tdc/stats/duplicates', (req, res) => {
  try {
    const historyFile = path.join(__dirname, 'results_history.json');
    
    if (!fs.existsSync(historyFile)) {
      return res.json({ 
        success: true, 
        stats: { 
          totalCycles: 0, 
          cyclesWithDuplicates: 0, 
          duplicateRate: 0 
        } 
      });
    }
    
    const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    const cyclesWithDuplicates = data.filter(item => 
      item.analysis?.hasDuplicates
    ).length;
    
    res.json({
      success: true,
      stats: {
        totalCycles: data.length,
        cyclesWithDuplicates: cyclesWithDuplicates,
        duplicateRate: data.length > 0 ? 
          Math.round((cyclesWithDuplicates / data.length) * 100) : 0,
        last24Hours: data.filter(item => {
          const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
          return new Date(item.timestamp).getTime() > dayAgo;
        }).length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

    app.get('/api/results', (req, res) => {
      if (!fs.existsSync(resultsFile)) {
        return res.status(404).json({ error: 'Plik results.json nie istnieje' });
      }

      try {
        const data = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
        res.json(data);
      } catch (e) {
        console.error('[TDC] Błąd odczytu results.json:', e.message);
        res.status(500).json({ error: 'Błąd odczytu pliku' });
      }
    });

    // DODANE: Endpointy do zarządzania wysyłką RS
    app.get('/api/tdc/rs-sender/status', (req, res) => {
      res.json(rsSender.getStatus());
    });

    app.get('/api/tdc/rs-sender/status/detailed', (req, res) => {
  try {
    const status = rsSender.getSendStatus();
    res.json({
      success: true,
      status: status,
      isActive: status.isSending || status.isWaitingForResponse,
      message: status.isSending ? 'Wysyłka w toku' : 
               status.isWaitingForResponse ? 'Oczekiwanie na odpowiedź' : 
               'Wysyłka nieaktywna'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Prostszy endpoint tylko dla UI - czy wysyłka jest aktywna
app.get('/api/tdc/rs-sender/active', (req, res) => {
  try {
    const status = rsSender.getSendStatus();
    const isActive = status.isSending || status.isWaitingForResponse;
    
    res.json({
      success: true,
      isActive: isActive,
      status: isActive ? 'active' : 'idle',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Endpoint do pobrania historii wysyłek
app.get('/api/tdc/rs-sender/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const resultsFile = path.join(__dirname, 'rs_send_results.json');
    
    if (!fs.existsSync(resultsFile)) {
      return res.json([]);
    }
    
    const data = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    // Najnowsze na początku
    data.reverse();
    
    // Ogranicz liczbę wyników
    const limitedData = data.slice(0, limit);
    
    res.json({
      success: true,
      history: limitedData,
      total: data.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
    app.post('/api/tdc/rs-sender/send-codes', async (req, res) => {
      try {
        const { codes } = req.body;
        if (!codes || !Array.isArray(codes)) {
          return res.status(400).json({ 
            success: false, 
            error: 'Parametr "codes" musi być tablicą' 
          });
        }
        
        const result = await rsSender.sendCodes(codes);
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.post('/api/tdc/rs-sender/abort', (req, res) => {
      rsSender.abortSending();
      res.json({ success: true, message: 'Wysyłka przerwana' });
    });

    app.get('/api/tdc/rs-sender/results', (req, res) => {
      try {
        const resultsFile = path.join(__dirname, 'rs_send_results.json');
        if (!fs.existsSync(resultsFile)) {
          return res.json([]);
        }
        
        const data = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
        res.json(data);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  getStatus() {
    return {
      active: this.currentCycle.active,
      triggerSource: this.currentCycle.triggerSource,
      triggerTime: this.currentCycle.triggerTime,
      received: this.currentCycle.received,
      config: this.config,
      digitalMonitoring: {
        active: this.digitalMonitoringActive,
        states: this.previousDigitalStates
      },
      digitalIOStatus: digitalIOManager.getStatus(),
      rsSenderStatus: rsSender.getStatus() // DODANE
    };
  }
}

module.exports = new TDCController();