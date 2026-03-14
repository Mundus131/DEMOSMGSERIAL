const EventEmitter = require('events');
const { logState } = require('./logger');
const rs = require('./rs');

class RSSender extends EventEmitter {
  constructor() {
    super();
    this.isSending = false;
    this.currentQueue = [];
    this.retryCounts = {};
    this.maxRetries = 3;
    this.responseTimeout = 1000; // 1 sekunda (domyślnie)
    this.timeoutTimer = null;
    this.currentCode = null;
    this.isWaitingForResponse = false;
    this.responseHandlers = new Map();
    this.senderMode = 'separate'; // separate | combined
  }

  /**
   * Główna funkcja do wysyłania kodów przez RS
   * @param {Array} codes - Tablica kodów do wysłania
   * @returns {Promise<Object>} - Wynik wysyłki
   */
  async sendCodes(codes) {
    if (this.isSending) {
      throw new Error('Inny proces wysyłania jest już aktywny');
    }

    this.isSending = true;
    this.currentQueue = [...codes];
    this.retryCounts = {};
    const results = {
      sent: 0,
      failed: 0,
      details: []
    };

    await logState(`[RS SENDER] Rozpoczynanie wysyłki ${codes.length} kodów`);

    try {
      // Sprawdź czy port RS jest otwarty
      const portStatus = rs.getPortStatus();
      if (!portStatus.isOpen) {
        throw new Error('Port RS nie jest otwarty');
      }

            if (this.senderMode === 'combined') {
        const combined = this.currentQueue.join(';');
        const sendResult = await this.sendSingleCode(combined);
        results.details.push(sendResult);
        if (sendResult.success) {
          results.sent = this.currentQueue.length;
          await logState(`[RS SENDER] Kody wys?ane pomy?lnie (combined): ${combined}`);
        } else {
          results.failed = this.currentQueue.length;
          await logState(`[RS SENDER] B??d wysy?ki (combined): ${sendResult.error}`);
        }
      } else {
        // Wy?lij kody jeden po drugim
        for (let i = 0; i < this.currentQueue.length; i++) {
          const code = this.currentQueue[i];
          const sendResult = await this.sendSingleCode(code);
          
          results.details.push(sendResult);
          
          if (sendResult.success) {
            results.sent++;
            await logState(`[RS SENDER] Kod wys?any pomy?lnie: ${code}`);
          } else {
            results.failed++;
            await logState(`[RS SENDER] B??d wysy?ki kodu: ${code} - ${sendResult.error}`);
          }

          // Ma?e op??nienie mi?dzy kodami
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      await logState(`[RS SENDER] Zakończono wysyłkę: ${results.sent}/${codes.length} sukcesów`);
      return results;

    } catch (error) {
      await logState(`[RS SENDER] Krytyczny błąd wysyłki: ${error.message}`);
      throw error;
    } finally {
      this.isSending = false;
      this.currentQueue = [];
      this.retryCounts = {};
      this.clearTimeout();
      this.clearAllResponseHandlers();
    }
  }

  /**
   * Wysyła pojedynczy kod z mechanizmem ponawiania
   */
  async sendSingleCode(code) {
    this.retryCounts[code] = 0;
    
    while (this.retryCounts[code] < this.maxRetries) {
      try {
        const result = await this.sendCodeWithConfirmation(code);
        
        if (result.success) {
          return {
            code,
            success: true,
            attempts: this.retryCounts[code] + 1,
            response: result.response
          };
        }
        
        this.retryCounts[code]++;
        await logState(`[RS SENDER] Ponawianie kodu ${code} (${this.retryCounts[code]}/${this.maxRetries})`);
        
        // Opóźnienie przed ponowną próbą
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        this.retryCounts[code]++;
        await logState(`[RS SENDER] Błąd podczas wysyłki ${code}: ${error.message}`);
        // odczekaj pełny timeout przed kolejną próbą
        await new Promise(resolve => setTimeout(resolve, this.responseTimeout));
      }
    }

    return {
      code,
      success: false,
      attempts: this.maxRetries,
      error: 'Przekroczono maksymalną liczbę prób'
    };
  }

  /**
   * Wysyła kod i czeka na potwierdzenie
   */
  async sendCodeWithConfirmation(code) {
    return new Promise(async (resolve, reject) => {
      this.currentCode = code;
      this.isWaitingForResponse = true;
      let responseBuffer = '';

      // Przygotuj ramkę do wysłania
      const frame = `\x02${code}\x03`; // <STX>KOD<ETX>
      await logState(`[RS SENDER] Oczekiwanie na odpowiedź (OK/NG) dla ${code}`);
      
      // Unikalny ID dla tego żądania
      const requestId = Date.now() + Math.random();
      
      // Handler dla odpowiedzi
      const responseHandler = (data) => {
        if (!this.isWaitingForResponse) return;

        let responseString = '';

        if (data && typeof data === 'object') {
          // Obsługa zdarzeń z rs.notifySseClients
          if (data.type && data.type !== 'raw_frame' && data.type !== 'parsed_frame') {
            return;
          }
          if (typeof data.data !== 'string') {
            return;
          }
          responseString = data.data;
        } else if (typeof data === 'string') {
          responseString = data;
        } else {
          return;
        }

        if (responseString.startsWith('data:')) {
          responseString = responseString.replace(/^data:\s*/i, '').trim();
        }
        
        console.log(`[RS SENDER] Odebrana odpowiedź: ${responseString}`);
        
        // Sprawdź czy to odpowiedź na nasze żądanie (z buforowaniem)
        responseBuffer = (responseBuffer + responseString).replace(/\s+/g, '');
        if (responseBuffer.length > 200) {
          responseBuffer = responseBuffer.slice(-200);
        }

        const normalized = responseBuffer;
        const okPatterns = [
          '\x02OK\x03', '\x02OK', 'OK\x03', 'OK'
        ];
        const ngPatterns = [
          '\x02NG\x03', '\x02NG', 'NG\x03', 'NG'
        ];

        const hasOk = okPatterns.some(pattern => normalized.includes(pattern));
        const hasNg = ngPatterns.some(pattern => normalized.includes(pattern));

        if (hasOk) {
          this.clearResponseHandler(requestId);
          this.clearTimeout();
          this.isWaitingForResponse = false;
          rs.removeSseClient(sseClient);
          resolve({ success: true, response: 'OK' });
        } else if (hasNg) {
          this.clearResponseHandler(requestId);
          this.clearTimeout();
          this.isWaitingForResponse = false;
          rs.removeSseClient(sseClient);
          resolve({ success: false, response: 'NG' });
        }
      };

      // Zapisz handler
      this.responseHandlers.set(requestId, responseHandler);

      // Dodaj nasłuchiwacz na dane RS
      const sseClient = {
        write: (data) => {
          try {
            const cleaned = data.toString().replace(/^data:\s*/i, '').trim();
            const parsed = JSON.parse(cleaned);
            responseHandler(parsed);
          } catch (e) {
            responseHandler(data.toString());
          }
        }
      };
      
      rs.addSseClient(sseClient);

      // Ustaw timeout
      this.timeoutTimer = setTimeout(() => {
        if (this.isWaitingForResponse) {
          this.clearResponseHandler(requestId);
          rs.removeSseClient(sseClient);
          this.isWaitingForResponse = false;
          resolve({ success: false, response: 'TIMEOUT' });
        }
      }, this.responseTimeout);

      // Wyślij kod
      try {
        const sendSuccess = rs.sendData(frame);
        if (!sendSuccess) {
          this.clearResponseHandler(requestId);
          rs.removeSseClient(sseClient);
          this.clearTimeout();
          reject(new Error('Błąd wysyłki danych RS'));
          return;
        }
        
        await logState(`[RS SENDER] Wysłano kod: ${frame}`);
      } catch (error) {
        this.clearResponseHandler(requestId);
        rs.removeSseClient(sseClient);
        this.clearTimeout();
        reject(error);
      }
    });
  }

  /**
   * Czyści handler odpowiedzi
   */
  clearResponseHandler(requestId) {
    if (this.responseHandlers.has(requestId)) {
      this.responseHandlers.delete(requestId);
    }
  }

  /**
   * Czyści wszystkie handlery
   */
  clearAllResponseHandlers() {
    this.responseHandlers.clear();
  }

  /**
   * Czyśli timeout
   */
  clearTimeout() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * Sprawdza status wysyłki
   */
  getStatus() {
    return {
      isSending: this.isSending,
      queueLength: this.currentQueue.length,
      currentCode: this.currentCode,
      isWaitingForResponse: this.isWaitingForResponse,
      retryCounts: this.retryCounts,
      mode: this.senderMode
    };
  }


  /**
 * Zwraca szczegółowy status wysyłki
 */
  getSendStatus() {
    return {
      isSending: this.isSending,
      queueLength: this.currentQueue.length,
      currentCode: this.currentCode,
      isWaitingForResponse: this.isWaitingForResponse,
      mode: this.senderMode,
      progress: this.currentQueue.length > 0 ? {
        total: this.currentQueue.length + Object.keys(this.retryCounts).length,
        processed: Object.keys(this.retryCounts).length,
        percentage: Math.round((Object.keys(this.retryCounts).length / 
          (this.currentQueue.length + Object.keys(this.retryCounts).length)) * 100) || 0
      } : null,
      timestamp: new Date().toISOString()
    };
  }
  /**
   * Przerywa aktualną wysyłkę
   */
  abortSending() {
    if (this.isSending) {
      this.isSending = false;
      this.clearTimeout();
      this.isWaitingForResponse = false;
      this.currentQueue = [];
      this.clearAllResponseHandlers();
      logState('[RS SENDER] Wysyłka przerwana przez użytkownika');
    }
  }

  setResponseTimeout(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('Nieprawidłowy timeout odpowiedzi');
    }
    this.responseTimeout = Math.round(value);
  }

  getResponseTimeout() {
    return this.responseTimeout;
  }

  setMode(mode) {
    const normalized = (mode || '').toLowerCase();
    if (!['separate', 'combined'].includes(normalized)) {
      throw new Error('Nieobs?ugiwany tryb wysy?ki');
    }
    this.senderMode = normalized;
  }

  getMode() {
    return this.senderMode;
  }
}

// Eksport singleton
const rsSender = new RSSender();
module.exports = rsSender;
