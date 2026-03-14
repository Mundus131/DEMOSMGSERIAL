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
    this.responseTimeout = 1000; // 1 sekunda
    this.timeoutTimer = null;
    this.currentCode = null;
    this.isWaitingForResponse = false;
    this.responseHandlers = new Map();
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

      // Wyślij kody jeden po drugim
      for (let i = 0; i < this.currentQueue.length; i++) {
        const code = this.currentQueue[i];
        const sendResult = await this.sendSingleCode(code);
        
        results.details.push(sendResult);
        
        if (sendResult.success) {
          results.sent++;
          await logState(`[RS SENDER] Kod wysłany pomyślnie: ${code}`);
        } else {
          results.failed++;
          await logState(`[RS SENDER] Błąd wysyłki kodu: ${code} - ${sendResult.error}`);
        }

        // Małe opóźnienie między kodami
        await new Promise(resolve => setTimeout(resolve, 50));
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

      // Przygotuj ramkę do wysłania
      const frame = `\x02${code}\x03`; // <STX>KOD<ETX>
      
      // Unikalny ID dla tego żądania
      const requestId = Date.now() + Math.random();
      
      // Handler dla odpowiedzi
      const responseHandler = (data) => {
        if (!this.isWaitingForResponse) return;

        const response = data.data || data;
        const responseString = typeof response === 'string' ? response : response.toString();
        
        console.log(`[RS SENDER] Odebrana odpowiedź: ${responseString}`);
        
        // Sprawdź czy to odpowiedź na nasze żądanie
        if (responseString.includes('\x02OK\x03')) {
          this.clearResponseHandler(requestId);
          this.clearTimeout();
          this.isWaitingForResponse = false;
          resolve({ success: true, response: 'OK' });
        } else if (responseString.includes('\x02NG\x03')) {
          this.clearResponseHandler(requestId);
          this.clearTimeout();
          this.isWaitingForResponse = false;
          resolve({ success: false, response: 'NG' });
        }
      };

      // Zapisz handler
      this.responseHandlers.set(requestId, responseHandler);

      // Dodaj nasłuchiwacz na dane RS
      const sseClient = {
        write: (data) => {
          try {
            const jsonStr = data.replace('data: ', '');
            const parsed = JSON.parse(jsonStr);
            responseHandler(parsed);
          } catch (e) {
            responseHandler({ data: data });
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
      retryCounts: this.retryCounts
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
}

// Eksport singleton
const rsSender = new RSSender();
module.exports = rsSender;
