import React, { useState, useEffect } from 'react';
import './App.css';

// Config
const getApiBaseUrl = () => {
  const hostname = window.location.hostname;

  if (hostname === 'localhost') {
    return 'http://localhost:5010';
  }

  if (hostname === 'http://192.168.0.100:18080') {
    return 'http://192.168.0.100:18080/proxy/5010';
  }

  if (hostname === '192.168.0.51') {
    return 'http://192.168.0.51:5010';
  }

  // domyślny fallback (np. na produkcji)
  return `http://${hostname}:5010`;
};

const config = {
  API_BASE_URL: getApiBaseUrl()
  //API_BASE_URL: "http://192.168.0.100:18080/proxy/5010",// def only 
};

const getFrontBackKeys = (obj) => {
  const keys = Object.keys(obj || {});
  const frontKey = keys.find((key) => key.toLowerCase().includes('prz')) || 'przod';
  const backKey = keys.find((key) => key.toLowerCase().includes('tyl')) || 'tyl';
  return { frontKey, backKey };
};

// Komponent zakładki RS
const RSConfigTab = () => {
  const [rsConfig, setRsConfig] = useState(null);
  const [rsStatus, setRsStatus] = useState(null);
  const [rsData, setRsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('config');
  const [rsSenderStatus, setRsSenderStatus] = useState(null);
  const [rsSenderDetailedStatus, setRsSenderDetailedStatus] = useState(null);
  const [formData, setFormData] = useState({});
  const [configLoaded, setConfigLoaded] = useState(false);
  const [senderMode, setSenderMode] = useState('separate');
  const [senderTimeout, setSenderTimeout] = useState(1000);

  // Pobierz konfigurację RS
  const fetchRsConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/rs/config`);
      const result = await response.json();
      if (result.success) {
        setRsConfig(result.config);
        setFormData({
          baudRate: result.config.serialConfig?.baudRate || 9600,
          dataBits: result.config.serialConfig?.dataBits || 8,
          stopBits: result.config.serialConfig?.stopBits || 1,
          parity: result.config.serialConfig?.parity || 'none',
          path: result.config.serialConfig?.path || '/dev/ttyUSB0',
          mode: result.config.mode || 'RS485'
        });
        setConfigLoaded(true);
      }
    } catch (error) {
      console.error('Błąd pobierania konfiguracji RS:', error);
      alert('Błąd pobierania konfiguracji RS');
    } finally {
      setLoading(false);
    }
  };

  // Pobierz status RS
  const fetchRsStatus = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/rs/status`);
      const result = await response.json();
      if (result.success) {
        setRsStatus(result.status);
      }
    } catch (error) {
      console.error('Błąd pobierania statusu RS:', error);
    }
  };

  // Pobierz tryb RS Sender
  const fetchRsSenderMode = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/tdc/rs-sender/mode`);
      const result = await response.json();
      if (result.success) {
        setSenderMode(result.currentMode);
        console.log('Aktualny tryb wysyłki:', result.currentMode);
      }
    } catch (error) {
      console.error('Błąd pobierania trybu RS Sender:', error);
    }
  };

  // Pobierz status RS Sender
  const fetchRsSenderStatus = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/tdc/rs-sender/status`);
      const result = await response.json();
      if (result.success) {
        setRsSenderStatus(result);
      }
    } catch (error) {
      console.error('Błąd pobierania statusu RS Sender:', error);
    }
  };
  const fetchRsSenderTimeout = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/tdc/rs-sender/timeout`);
      const result = await response.json();
      if (result.success) {
        setSenderTimeout(result.timeoutMs);
      }
    } catch (error) {
      console.error('B??d pobierania timeoutu RS Sender:', error);
    }
  };



  // Pobierz szczegółowy status RS Sender
  const fetchRsSenderDetailedStatus = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/tdc/rs-sender/status/detailed`);
      const result = await response.json();
      if (result.success) {
        setRsSenderDetailedStatus(result);
      }
    } catch (error) {
      console.error('Błąd pobierania szczegółowego statusu RS Sender:', error);
    }
  };

  // Pobierz ostatnie dane RS
  const fetchRsData = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/rs/read`);
      const result = await response.json();
      if (result.success) {
        setRsData(prev => [result.data, ...prev.slice(0, 49)]);
      }
    } catch (error) {
      console.error('Błąd pobierania danych RS:', error);
    }
  };

  // Aktualizuj konfigurację RS
  const updateRsConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/rs/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      if (result.success) {
        await fetchRsConfig();
        alert('Konfiguracja RS zaktualizowana pomyślnie!');
      } else {
        alert('Błąd aktualizacji konfiguracji: ' + result.error);
      }
    } catch (error) {
      console.error('Błąd aktualizacji konfiguracji RS:', error);
      alert('Błąd aktualizacji konfiguracji');
    } finally {
      setLoading(false);
    }
  };

  // Ustaw tryb RS (RS485/RS422)
  const setRsMode = async (mode) => {
    setLoading(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/rs/mode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode }),
      });
      const result = await response.json();
      if (result.success) {
        await fetchRsConfig();
        alert(`Tryb RS ustawiony na: ${mode}`);
      } else {
        alert('Błąd ustawiania trybu RS: ' + result.error);
      }
    } catch (error) {
      console.error('Błąd ustawiania trybu RS:', error);
      alert('Błąd ustawiania trybu RS');
    } finally {
      setLoading(false);
    }
  };

  // Ustaw tryb wysyłki RS Sender
  const setRsSenderMode = async (mode) => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/tdc/rs-sender/mode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode }),
      });
      const result = await response.json();
      if (result.success) {
        setSenderMode(result.currentMode);
        alert(`Tryb wysyłki ustawiony na: ${mode}`);
      } else {
        alert('Błąd ustawiania trybu wysyłki: ' + result.error);
      }
    } catch (error) {
      console.error('Błąd ustawiania trybu wysyłki:', error);
      alert('Błąd ustawiania trybu wysyłki');
    }
  };

  // Restart portu RS
  const restartRs = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/rs/restart`, {
        method: 'POST',
      });
      const result = await response.json();
      if (result.success) {
        alert('Port RS restartowany');
        setTimeout(fetchRsStatus, 2000);
      }
    } catch (error) {
      console.error('Błąd restartowania RS:', error);
    }
  };
  const setRsSenderTimeout = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/tdc/rs-sender/timeout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ timeoutMs: Number(senderTimeout) }),
      });
      const result = await response.json();
      if (result.success) {
        setSenderTimeout(result.timeoutMs);
        alert(`Timeout ustawiony na: ${result.timeoutMs} ms`);
      } else {
        alert('B??d ustawiania timeoutu: ' + result.error);
      }
    } catch (error) {
      console.error('B??d ustawiania timeoutu RS Sender:', error);
      alert('B??d ustawiania timeoutu RS Sender');
    }
  };



  // Wyślij dane przez RS
  const sendRsData = async (data) => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/rs/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data }),
      });
      const result = await response.json();
      if (result.success) {
        alert('Dane wysłane pomyślnie!');
        setTimeout(fetchRsData, 500);
      } else {
        alert('Błąd wysyłania danych: ' + result.error);
      }
    } catch (error) {
      console.error('Błąd wysyłania danych RS:', error);
    }
  };

  // Testowa wysyłka kodów przez RS Sender
  const testRsSend = async (codes, mode) => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/tdc/test-rs-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ codes, mode }),
      });
      const result = await response.json();
      if (result.success) {
        alert(`Test wysyłki zakończony pomyślnie! (Tryb: ${result.mode})`);
        console.log('Wynik testu:', result.result);
      } else {
        alert('Błąd testowej wysyłki: ' + result.error);
      }
    } catch (error) {
      console.error('Błąd testowej wysyłki RS:', error);
      alert('Błąd testowej wysyłki');
    }
  };

  // Resetuj formularz do aktualnej konfiguracji
  const resetFormToCurrentConfig = () => {
    if (rsConfig) {
      setFormData({
        baudRate: rsConfig.serialConfig?.baudRate || 9600,
        dataBits: rsConfig.serialConfig?.dataBits || 8,
        stopBits: rsConfig.serialConfig?.stopBits || 1,
        parity: rsConfig.serialConfig?.parity || 'none',
        path: rsConfig.serialConfig?.path || '/dev/ttyUSB0',
        mode: rsConfig.mode || 'RS485'
      });
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  useEffect(() => {
    fetchRsConfig();
    fetchRsStatus();
    fetchRsData();
    fetchRsSenderStatus();
    fetchRsSenderDetailedStatus();
        fetchRsSenderTimeout();
    fetchRsSenderMode();
    fetchRsSenderTimeout();

    const interval = setInterval(() => {
      fetchRsStatus();
      if (activeTab === 'monitor') {
        fetchRsData();
      }
      if (activeTab === 'config') {
        fetchRsSenderStatus();
        fetchRsSenderDetailedStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeTab]);

  const ConfigForm = () => (
    <div className="rs-config-form">
      <div className="config-header">
        <h3>Konfiguracja Portu RS</h3>
        <div className="config-actions-top">
          <button 
            onClick={fetchRsConfig}
            className="btn btn-primary"
            disabled={loading}
          >
            🔄 Pobierz Konfigurację
          </button>
          <button 
            onClick={resetFormToCurrentConfig}
            className="btn btn-secondary"
            disabled={loading || !configLoaded}
          >
            ↩️ Resetuj Formularz
          </button>
        </div>
      </div>
      
      {configLoaded && (
        <div className="config-grid">
          <div className="config-group">
            <label>Baud Rate:</label>
            <select 
              value={formData.baudRate || 9600}
              onChange={(e) => handleInputChange('baudRate', parseInt(e.target.value))}
              disabled={loading}
            >
              <option value={9600}>9600</option>
              <option value={19200}>19200</option>
              <option value={38400}>38400</option>
              <option value={57600}>57600</option>
              <option value={115200}>115200</option>
            </select>
          </div>

          <div className="config-group">
            <label>Data Bits:</label>
            <select 
              value={formData.dataBits || 8}
              onChange={(e) => handleInputChange('dataBits', parseInt(e.target.value))}
              disabled={loading}
            >
              <option value={5}>5</option>
              <option value={6}>6</option>
              <option value={7}>7</option>
              <option value={8}>8</option>
            </select>
          </div>

          <div className="config-group">
            <label>Stop Bits:</label>
            <select 
              value={formData.stopBits || 1}
              onChange={(e) => handleInputChange('stopBits', parseFloat(e.target.value))}
              disabled={loading}
            >
              <option value={1}>1</option>
              <option value={1.5}>1.5</option>
              <option value={2}>2</option>
            </select>
          </div>

          <div className="config-group">
            <label>Parity:</label>
            <select 
              value={formData.parity || 'none'}
              onChange={(e) => handleInputChange('parity', e.target.value)}
              disabled={loading}
            >
              <option value="none">None</option>
              <option value="even">Even</option>
              <option value="odd">Odd</option>
              <option value="mark">Mark</option>
              <option value="space">Space</option>
            </select>
          </div>

          <div className="config-group">
            <label>Tryb RS:</label>
            <select 
              value={formData.mode || 'RS485'}
              onChange={(e) => handleInputChange('mode', e.target.value)}
              disabled={loading}
            >
              <option value="RS485">RS485</option>
              <option value="RS422">RS422</option>
              <option value="RS232">RS232</option>
            </select>
          </div>

          <div className="config-group full-width">
            <label>Port Path:</label>
            <input 
              type="text" 
              value={formData.path || '/dev/ttyUSB0'}
              onChange={(e) => handleInputChange('path', e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
      )}

      <div className="config-actions-bottom">
        <button 
          onClick={updateRsConfig}
          className="btn btn-success"
          disabled={loading || !configLoaded}
        >
          💾 Wyślij Konfigurację
        </button>
        
        <button 
          onClick={() => {
            setFormData({
              baudRate: 9600,
              dataBits: 8,
              stopBits: 1,
              parity: 'none',
              path: '/dev/ttyUSB0',
              mode: 'RS485'
            });
          }}
          className="btn btn-warning"
          disabled={loading}
        >
          ⚡ Ustaw Domyślne
        </button>
      </div>

      <div className="rs-sender-config">
        <h4>Konfiguracja RS Sender</h4>
        
        <div className="sender-config-section">
          <div className="sender-mode-config">
            <h5>Tryb wysyłki kodów</h5>
            <div className="mode-selector">
              <div className="mode-option">
                <input 
                  type="radio" 
                  id="mode-separate"
                  name="senderMode"
                  value="separate"
                  checked={senderMode === 'separate'}
                  onChange={(e) => setRsSenderMode(e.target.value)}
                />
                <label htmlFor="mode-separate">
                  <strong>Separate</strong>
                  <span>Każdy kod osobno: &lt;STX&gt;kod1&lt;ETX&gt;, &lt;STX&gt;kod2&lt;ETX&gt;, ...</span>
                </label>
              </div>
              
              <div className="mode-option">
                <input 
                  type="radio" 
                  id="mode-combined"
                  name="senderMode"
                  value="combined"
                  checked={senderMode === 'combined'}
                  onChange={(e) => setRsSenderMode(e.target.value)}
                />
                <label htmlFor="mode-combined">
                  <strong>Combined</strong>
                  <span>Wszystkie kody razem: &lt;STX&gt;kod1;kod2;...&lt;ETX&gt;</span>
                </label>
              </div>
            </div>
            
            <div className="current-mode-info">
              <span className="mode-label">Aktualny tryb:</span>
              <span className={`mode-value ${senderMode === 'separate' ? 'mode-separate' : 'mode-combined'}`}>
                {senderMode === 'separate' ? 'SEPARATE' : 'COMBINED'}
              </span>
            </div>

            <div className="sender-timeout-config">
              <h5>Timeout odpowiedzi (ms)</h5>
              <div className="timeout-row">
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={senderTimeout}
                  onChange={(e) => setSenderTimeout(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  onClick={setRsSenderTimeout}
                >
                  Zapisz
                </button>
              </div>
            </div>
          </div>

          {rsSenderDetailedStatus && (
            <div className="sender-detailed-status">
              <h5>Szczegółowy status</h5>
              <div className="status-grid-detailed">
                <div className="status-item">
                  <span className="status-label">Status:</span>
                  <span className={`status-value ${
                    rsSenderDetailedStatus.status?.isSending ? 'status-sending' : 
                    rsSenderDetailedStatus.status?.isWaitingForResponse ? 'status-waiting' : 'status-idle'
                  }`}>
                    {rsSenderDetailedStatus.message || 'NIEAKTYWNY'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Wysyłanie:</span>
                  <span className={`status-value ${
                    rsSenderDetailedStatus.status?.isSending ? 'status-active' : 'status-inactive'
                  }`}>
                    {rsSenderDetailedStatus.status?.isSending ? 'TAK' : 'NIE'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Oczekiwanie na odpowiedź:</span>
                  <span className={`status-value ${
                    rsSenderDetailedStatus.status?.isWaitingForResponse ? 'status-active' : 'status-inactive'
                  }`}>
                    {rsSenderDetailedStatus.status?.isWaitingForResponse ? 'TAK' : 'NIE'}
                  </span>
                </div>
                {rsSenderDetailedStatus.status?.currentCode && (
                  <div className="status-item full-width">
                    <span className="status-label">Aktualny kod:</span>
                    <span className="status-value code-preview">
                      {rsSenderDetailedStatus.status.currentCode}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {rsSenderStatus && (
            <div className="sender-status">
              <h5>Status wysyłki</h5>
              <div className="status-grid-small">
                <div className="status-item">
                  <span className="status-label">Status:</span>
                  <span className={`status-value ${rsSenderStatus.isSending ? 'status-sending' : 'status-idle'}`}>
                    {rsSenderStatus.isSending ? 'WYSYŁANIE' : 'OCZEKIWANIE'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Aktualny kod:</span>
                  <span className="status-value code-preview">{rsSenderStatus.currentCode || 'Brak'}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Kolejka:</span>
                  <span className="status-value">{rsSenderStatus.queueLength || 0} kodów</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="test-send-section">
          <h5>Test wysyłki RS</h5>
          <div className="test-send-form">
            <input 
              type="text" 
              id="testCodes"
              placeholder="Wpisz kody (oddzielone przecinkami)..."
              className="send-input"
              defaultValue="TEST1,TEST2,TEST3"
            />
            <button 
              onClick={() => {
                const input = document.getElementById('testCodes');
                const codes = input.value.split(',').map(code => code.trim()).filter(code => code);
                if (codes.length > 0) {
                  testRsSend(codes, senderMode);
                } else {
                  alert('Wpisz przynajmniej jeden kod');
                }
              }}
              className="btn btn-primary"
            >
              🧪 Testuj Wysyłkę
            </button>
          </div>
          <div className="test-info">
            <small>Tryb: <strong>{senderMode === 'separate' ? 'SEPARATE' : 'COMBINED'}</strong></small>
          </div>
        </div>
      </div>

      <div className="port-actions">
        <button 
          onClick={restartRs}
          className="btn btn-warning"
          disabled={loading}
        >
          🔄 Restart Portu
        </button>
      </div>

      <div className="status-info">
        <h4>Status Portu:</h4>
        <div className="status-grid">
          <div className="status-item">
            <span className="status-label">Port otwarty:</span>
            <span className={`status-value ${rsStatus?.isOpen ? 'status-on' : 'status-off'}`}>
              {rsStatus?.isOpen ? 'TAK' : 'NIE'}
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">Ostatnie dane:</span>
            <span className="status-value">{rsStatus?.lastData || 'Brak'}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Długość danych:</span>
            <span className="status-value">{rsStatus?.lastDataLength || 0} bajtów</span>
          </div>
          <div className="status-item">
            <span className="status-label">Klienci SSE:</span>
            <span className="status-value">{rsStatus?.sseClients || 0}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Tryb RS:</span>
            <span className="status-value">{rsConfig?.mode || 'RS485'}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Baud Rate:</span>
            <span className="status-value">{rsConfig?.baudRate || 9600}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const MonitorTab = () => (
    <div className="rs-monitor">
      <h3>Monitor Danych RS</h3>
      
      <div className="monitor-controls">
        <button 
          onClick={() => sendRsData('TEST_MESSAGE')}
          className="btn btn-primary"
        >
          📤 Wyślij Test
        </button>
        
        <div className="send-form">
          <input 
            type="text" 
            id="sendData"
            placeholder="Wpisz dane do wysłania..."
            className="send-input"
          />
          <button 
            onClick={() => {
              const input = document.getElementById('sendData');
              if (input.value.trim()) {
                sendRsData(input.value.trim());
                input.value = '';
              }
            }}
            className="btn btn-success"
          >
            📨 Wyślij
          </button>
        </div>
      </div>

      <div className="data-list">
        <h4>Ostatnie Ramki ({rsData.length})</h4>
        <div className="data-items">
          {rsData.map((item, index) => (
            <div key={index} className="data-item">
              <div className="data-time">
                {new Date(item.timestamp).toLocaleTimeString()}
              </div>
              <div className="data-content">
                {item.lastData || 'Brak danych'}
              </div>
              <div className={`data-status ${item.isPortOpen ? 'status-on' : 'status-off'}`}>
                {item.isPortOpen ? 'OPEN' : 'CLOSED'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="rs-tab">
      <div className="tab-navigation">
        <button 
          className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          Konfiguracja
        </button>
        <button 
          className={`tab-btn ${activeTab === 'monitor' ? 'active' : ''}`}
          onClick={() => setActiveTab('monitor')}
        >
          Monitor
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'config' && <ConfigForm />}
        {activeTab === 'monitor' && <MonitorTab />}
      </div>
    </div>
  );
};

const SystemConfigTab = ({ systemMode }) => {
  const [formData, setFormData] = useState({
    mode: systemMode || 'lectory',
    cycleTimeout: 5000,
    lectory: {
      lewy: '',
      prawy: '',
      front: '',
      back: ''
    },
    expectedTags: '',
    rfidReaders: []
  });
  const [lectoryKeys, setLectorsKeys] = useState({ frontKey: 'przod', backKey: 'tyl' });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [digitalStatus, setDigitalStatus] = useState(null);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/configuration`);
      const result = await response.json();
      const lectoryConfig = result.lectory || {};
      const { frontKey, backKey } = getFrontBackKeys(lectoryConfig);

      setLectorsKeys({ frontKey, backKey });
      setFormData({
        mode: result.mode || 'lectory',
        cycleTimeout: result.tdc?.cycleTimeout || 5000,
        lectory: {
          lewy: lectoryConfig.lewy || '',
          prawy: lectoryConfig.prawy || '',
          front: lectoryConfig[frontKey] || '',
          back: lectoryConfig[backKey] || ''
        },
        expectedTags: result.rfid?.expectedTags ?? '',
        rfidReaders: (result.rfid?.readers || []).map((reader, index) => ({
          id: reader.id || `RFID-${index + 1}`,
          ip: reader.ip || '',
          port: reader.port || ''
        }))
      });
      setConfigLoaded(true);
    } catch (error) {
      console.error('Błąd pobierania konfiguracji:', error);
      setSaveStatus({ type: 'error', message: 'Błąd pobierania konfiguracji' });
    } finally {
      setLoading(false);
    }
  };

  const fetchDigitalStatus = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/tdc/status`);
      const result = await response.json();
      setDigitalStatus(result);
    } catch (error) {
      console.error('Błąd pobierania statusu TDC:', error);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchDigitalStatus();

    const interval = setInterval(() => {
      fetchDigitalStatus();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (systemMode) {
      setFormData((prev) => ({ ...prev, mode: systemMode }));
    }
  }, [systemMode]);

  const updateLectorField = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      lectory: {
        ...prev.lectory,
        [field]: value
      }
    }));
  };

  const updateRfidReader = (index, field, value) => {
    setFormData((prev) => {
      const nextReaders = [...prev.rfidReaders];
      nextReaders[index] = {
        ...nextReaders[index],
        [field]: value
      };
      return { ...prev, rfidReaders: nextReaders };
    });
  };

  const addRfidReader = () => {
    setFormData((prev) => ({
      ...prev,
      rfidReaders: [
        ...prev.rfidReaders,
        { id: `RFID-${prev.rfidReaders.length + 1}`, ip: '', port: '' }
      ]
    }));
  };

  const removeRfidReader = (index) => {
    setFormData((prev) => ({
      ...prev,
      rfidReaders: prev.rfidReaders.filter((_, idx) => idx !== index)
    }));
  };

  const saveConfiguration = async () => {
    setLoading(true);
    setSaveStatus(null);
    try {
      const payload = {
        mode: formData.mode,
        tdc: {
          cycleTimeout: Number(formData.cycleTimeout) || 5000
        }
      };

      if (formData.mode === 'lectory') {
        payload.lectory = {
          lewy: formData.lectory.lewy,
          prawy: formData.lectory.prawy,
          [lectoryKeys.frontKey]: formData.lectory.front,
          [lectoryKeys.backKey]: formData.lectory.back
        };
      } else {
        payload.rfid = {
          expectedTags: Number(formData.expectedTags) || 0,
          readers: formData.rfidReaders
            .filter((reader) => reader.ip && reader.port)
            .map((reader, index) => ({
              id: reader.id || `RFID-${index + 1}`,
              ip: reader.ip,
              port: Number(reader.port)
            }))
        };
      }

      const response = await fetch(`${config.API_BASE_URL}/api/configuration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        setSaveStatus({ type: 'success', message: 'Konfiguracja zapisana' });
        await fetchConfig();
        await fetchDigitalStatus();
      } else {
        setSaveStatus({
          type: 'error',
          message: result.error || 'Błąd zapisu konfiguracji'
        });
      }
    } catch (error) {
      console.error('Błąd zapisu konfiguracji:', error);
      setSaveStatus({ type: 'error', message: 'Błąd zapisu konfiguracji' });
    } finally {
      setLoading(false);
    }
  };

  const digitalStates = digitalStatus?.digitalMonitoring?.states || {};
  const dioEntries = Object.entries(digitalStates);

  return (
    <div className="config-tab">
      <div className="config-section">
        <h3>Tryb pracy</h3>
        <div className="config-actions-top">
          <button
            onClick={fetchConfig}
            className="btn btn-primary"
            disabled={loading}
          >
            🔄 Pobierz Konfigurację
          </button>
          <button
            onClick={saveConfiguration}
            className="btn btn-success"
            disabled={loading || !configLoaded}
          >
            💾 Zapisz Konfigurację
          </button>
        </div>

        <div className="config-grid">
          <div className="config-group">
            <label>Tryb:</label>
            <select
              value={formData.mode}
              onChange={(e) => setFormData((prev) => ({ ...prev, mode: e.target.value }))}
              disabled={loading}
            >
              <option value="lectory">Lektory</option>
              <option value="rfid">RFID</option>
            </select>
          </div>

          <div className="config-group">
            <label>Timeout TDC (ms):</label>
            <input
              type="number"
              value={formData.cycleTimeout}
              onChange={(e) => setFormData((prev) => ({ ...prev, cycleTimeout: e.target.value }))}
              min="100"
              step="100"
              disabled={loading}
            />
          </div>
        </div>
      </div>

      {formData.mode === 'lectory' ? (
        <div className="config-section">
          <h3>Adresy lektorów</h3>
          <div className="config-grid">
            <div className="config-group">
              <label>Lewy:</label>
              <input
                type="text"
                value={formData.lectory.lewy}
                onChange={(e) => updateLectorField('lewy', e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="config-group">
              <label>Prawy:</label>
              <input
                type="text"
                value={formData.lectory.prawy}
                onChange={(e) => updateLectorField('prawy', e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="config-group">
              <label>Przód:</label>
              <input
                type="text"
                value={formData.lectory.front}
                onChange={(e) => updateLectorField('front', e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="config-group">
              <label>Tył:</label>
              <input
                type="text"
                value={formData.lectory.back}
                onChange={(e) => updateLectorField('back', e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="config-section">
          <h3>Urządzenia RFID</h3>
          <div className="config-grid">
            <div className="config-group">
              <label>Oczekiwane tagi (good read):</label>
              <input
                type="number"
                min="0"
                step="1"
                value={formData.expectedTags}
                onChange={(e) => setFormData((prev) => ({ ...prev, expectedTags: e.target.value }))}
                disabled={loading}
              />
            </div>
          </div>
          <div className="rfid-list">
            {formData.rfidReaders.length === 0 ? (
              <div className="rfid-empty">Brak zdefiniowanych urządzeń RFID</div>
            ) : (
              formData.rfidReaders.map((reader, index) => (
                <div key={index} className="rfid-row">
                  <input
                    type="text"
                    placeholder="ID (opcjonalnie)"
                    value={reader.id || ''}
                    onChange={(e) => updateRfidReader(index, 'id', e.target.value)}
                    disabled={loading}
                  />
                  <input
                    type="text"
                    placeholder="Adres IP"
                    value={reader.ip || ''}
                    onChange={(e) => updateRfidReader(index, 'ip', e.target.value)}
                    disabled={loading}
                  />
                  <input
                    type="number"
                    placeholder="Port"
                    value={reader.port || ''}
                    onChange={(e) => updateRfidReader(index, 'port', e.target.value)}
                    disabled={loading}
                  />
                  <button
                    className="btn btn-danger"
                    onClick={() => removeRfidReader(index)}
                    disabled={loading}
                  >
                    Usuń
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="config-actions-bottom">
            <button
              className="btn btn-secondary"
              onClick={addRfidReader}
              disabled={loading}
            >
              ➕ Dodaj urządzenie
            </button>
          </div>
        </div>
      )}

      <div className="config-section">
        <h3>Stany cyfrowe wejść TDC</h3>
        {dioEntries.length === 0 ? (
          <div className="dio-empty">Brak danych o wejściach cyfrowych</div>
        ) : (
          <div className="dio-list">
            {dioEntries.map(([name, state]) => (
              <div key={name} className="dio-row">
                <span className="dio-name">{name}</span>
                <span className="dio-direction">IN</span>
                <span
                  className={`dio-state ${
                    state === 'HIGH'
                      ? 'state-high'
                      : state === 'LOW'
                      ? 'state-low'
                      : 'state-unknown'
                  }`}
                >
                  {state || 'UNKNOWN'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {saveStatus && (
        <div className={`config-status ${saveStatus.type}`}>
          {saveStatus.message}
        </div>
      )}
    </div>
  );
};

const RfidView = () => {
  const [status, setStatus] = useState(null);
  const [expectedTags, setExpectedTags] = useState(0);
  const [lastCycle, setLastCycle] = useState(null);
  const [cycleReaders, setCycleReaders] = useState([]);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/rfid/status`);
      const result = await response.json();
      if (result) {
        setStatus(result.status || result);
      }
    } catch (error) {
      console.error('Błąd pobierania statusu RFID:', error);
    }
  };

  const fetchExpectedTags = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/configuration`);
      const result = await response.json();
      setExpectedTags(Number(result?.rfid?.expectedTags) || 0);
    } catch (error) {
      console.error('Błąd pobierania konfiguracji RFID:', error);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchExpectedTags();
    const interval = setInterval(() => {
      fetchStatus();
      fetchExpectedTags();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const source = new EventSource(`${config.API_BASE_URL}/api/rfid/events`);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setLastCycle(payload);
        fetchStatus();
      } catch (error) {
        console.error('Błąd parsowania zdarzenia RFID:', error);
      }
    };
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, []);

  useEffect(() => {
    if (lastCycle && status?.readers) {
      setCycleReaders(status.readers);
    }
  }, [lastCycle, status]);

  const readers = lastCycle ? cycleReaders : (status?.readers || []);
  const cycleResults = lastCycle?.results || null;
  const uniqueTags = new Set();
  if (cycleResults) {
    Object.values(cycleResults).forEach((codes) => {
      (codes || []).forEach((tag) => {
        if (tag && tag !== 'NoRead' && tag !== 'NORREAD') {
          uniqueTags.add(tag);
        }
      });
    });
  }
  const uniqueCount = uniqueTags.size;
  const cycleCount = lastCycle?.uniqueCount ?? uniqueCount;
  const cycleExpected = lastCycle?.expectedCount ?? expectedTags;
  const goodRead = lastCycle
    ? lastCycle.goodRead
    : expectedTags > 0
    ? uniqueCount >= expectedTags
    : uniqueCount > 0;
  const cycleTime = lastCycle?.timestamp
    ? new Date(lastCycle.timestamp).toLocaleString()
    : null;

  return (
    <div className="rfid-view">
      <div className="rfid-header">
        <h3>RFID - urządzenia i ostatnie tagi</h3>
        <div className={`rfid-goodread ${goodRead ? 'good' : 'bad'}`}>
          Good Read: {cycleCount}/{cycleExpected || 0}
        </div>
      </div>
      {cycleTime && (
        <div className="rfid-cycle-time">Ostatni cykl: {cycleTime}</div>
      )}
      {readers.length === 0 ? (
        <div className="rfid-empty">Brak zdefiniowanych urządzeń RFID</div>
      ) : (
        <div className="rfid-cards">
          {readers.map((reader) => {
            const lastRead = reader.lastRead;
            const tags = cycleResults ? (cycleResults[reader.id] || []) : [];
            const lastTime = cycleResults ? (cycleTime || 'Brak danych') : 'Brak danych';

            return (
              <div key={reader.id} className="rfid-card">
                <div className="rfid-card-header">
                  <div className="rfid-card-title">{reader.id}</div>
                  <div className="rfid-card-meta">
                    {reader.ip}:{reader.port}
                  </div>
                </div>
                <div className="rfid-tags">
                  {tags.length === 0 ? (
                    <span className="rfid-tag empty">Brak tagów</span>
                  ) : (
                    tags.map((tag, index) => (
                      <span key={index} className="rfid-tag">
                        {tag}
                      </span>
                    ))
                  )}
                </div>
                <div className="rfid-last-time">Ostatni odczyt: {lastTime}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Główna aplikacja
function App() {
  const [data, setData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isIndustrial, setIsIndustrial] = useState(false);
  const [activeView, setActiveView] = useState('main');
  const [systemMode, setSystemMode] = useState('lectory');
  const [rsSenderDetailedStatus, setRsSenderDetailedStatus] = useState(null);
  const [rsSenderMode, setRsSenderMode] = useState(null);

  const toggleStyle = () => {
    setIsIndustrial(!isIndustrial);
    if (!isIndustrial) {
      document.body.classList.add('industrial');
    } else {
      document.body.classList.remove('industrial');
    }
  };

  // Pobierz szczegółowy status RS Sender
  const fetchRsSenderDetailedStatus = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/tdc/rs-sender/status/detailed`);
      const result = await response.json();
      if (result.success) {
        setRsSenderDetailedStatus(result);
      }
    } catch (error) {
      console.error('Błąd pobierania szczegółowego statusu RS Sender:', error);
    }
  };

  // Pobierz tryb RS Sender
  const fetchRsSenderMode = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/tdc/rs-sender/mode`);
      const result = await response.json();
      if (result.success) {
        setRsSenderMode(result.currentMode);
      }
    } catch (error) {
      console.error('Błąd pobierania trybu RS Sender:', error);
    }
  };

  const fetchSystemMode = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/configuration`);
      const result = await response.json();
      if (result?.mode) {
        setSystemMode(result.mode);
      }
    } catch (error) {
      console.error('Błąd pobierania trybu systemu:', error);
    }
  };

  useEffect(() => {
    fetchSystemMode();
    const interval = setInterval(fetchSystemMode, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (systemMode === 'rfid' && activeView === 'main') {
      setActiveView('rfid');
    }
    if (systemMode === 'lectory' && activeView === 'rfid') {
      setActiveView('main');
    }
  }, [systemMode, activeView]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${config.API_BASE_URL}/api/results`);
        const result = await response.json();
        
        if (result.success) {
          setData(result);
          setLastUpdate(new Date(result.timestamp));
          setIsConnected(true);
        }
      } catch (error) {
        console.error('Błąd podczas pobierania danych:', error);
        setIsConnected(false);
      }
    };

    if (activeView === 'main') {
      fetchData();
      fetchRsSenderDetailedStatus();
      fetchRsSenderMode();
      
      const interval = setInterval(() => {
        fetchData();
        fetchRsSenderDetailedStatus();
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [activeView]);

  const ensureTwoValues = (values) => {
    if (!values || values.length === 0) return ["NoRead", "NoRead"];
    if (values.length === 1) return [values[0], "NoRead"];
    return values.slice(0, 2);
  };

  const filterResults = (results) => {
    if (!results) return {};
    
    const filtered = { ...results };
    const { frontKey, backKey } = getFrontBackKeys(filtered);
    
    const existsInSide = (value) => {
      const inLeft = filtered.lewy?.includes(value);
      const inRight = filtered.prawy?.includes(value);
      return inLeft || inRight;
    };
    
    if (filtered[frontKey] && filtered[frontKey].length > 0) {
      const frontValue = filtered[frontKey][0];
      if (frontValue !== "NoRead" && existsInSide(frontValue)) {
        filtered[frontKey] = ["NoRead"];
      }
    }
    
    if (filtered[backKey] && filtered[backKey].length > 0) {
      const backValue = filtered[backKey][0];
      if (backValue !== "NoRead" && existsInSide(backValue)) {
        filtered[backKey] = ["NoRead"];
      }
    }
    
    return filtered;
  };

  const shouldShow6Tiles = (filteredResults) => {
    if (!filteredResults) return false;
    
    const { frontKey, backKey } = getFrontBackKeys(filteredResults);
    const przod = filteredResults[frontKey] || [];
    const tyl = filteredResults[backKey] || [];
    
    const przodHasData = przod.length > 0 && przod.some(value => value !== "NoRead");
    const tylHasData = tyl.length > 0 && tyl.some(value => value !== "NoRead");
    
    if (!przodHasData && !tylHasData) {
      return false;
    }
    
    return przodHasData || tylHasData;
  };

  const Tile = ({ title, values, className = "" }) => (
    <div className={`tile ${className}`}>
      <h3 className="tile-title">{title}</h3>
      <div className="tile-content">
        {values.map((value, index) => (
          <div 
            key={index} 
            className={`value-item ${
              value === "NoRead" ? 'value-error' : 'value-success'
            }`}
          >
            {value}
          </div>
        ))}
      </div>
    </div>
  );

  // Komponent statusu RS Sender dla widoku głównego
  const RsSenderStatusPanel = () => (
    <div className="rs-sender-status-panel">
      <div className="status-header">
        <h4>RS Sender Status</h4>
        <div className="status-refresh">
          <button 
            onClick={fetchRsSenderDetailedStatus}
            className="btn-refresh"
            title="Odśwież status"
          >
            🔄
          </button>
        </div>
      </div>
      
      {rsSenderDetailedStatus ? (
        <div className="status-content">
          <div className="status-main">
            <div className={`status-indicator ${
              rsSenderDetailedStatus.status?.isSending ? 'status-active' : 
              rsSenderDetailedStatus.status?.isWaitingForResponse ? 'status-waiting' : 'status-inactive'
            }`}>
              {rsSenderDetailedStatus.status?.isSending ? '●' : 
               rsSenderDetailedStatus.status?.isWaitingForResponse ? '○' : '○'}
            </div>
            <div className="status-info">
              <div className="status-message">
                {rsSenderDetailedStatus.message || 'Status nieznany'}
              </div>
              <div className="status-mode">
                Tryb: <span className="mode-label">{rsSenderMode || 'Unknown'}</span>
              </div>
            </div>
          </div>
          
          <div className="status-details">
            {rsSenderDetailedStatus.status?.currentCode && (
              <div className="status-detail">
                <span className="detail-label">Aktualny kod:</span>
                <span className="detail-value">{rsSenderDetailedStatus.status.currentCode}</span>
              </div>
            )}
            <div className="status-detail">
              <span className="detail-label">Wysyłanie:</span>
              <span className={`detail-value ${
                rsSenderDetailedStatus.status?.isSending ? 'detail-active' : 'detail-inactive'
              }`}>
                {rsSenderDetailedStatus.status?.isSending ? 'TAK' : 'NIE'}
              </span>
            </div>
            <div className="status-detail">
              <span className="detail-label">Oczekiwanie:</span>
              <span className={`detail-value ${
                rsSenderDetailedStatus.status?.isWaitingForResponse ? 'detail-active' : 'detail-inactive'
              }`}>
                {rsSenderDetailedStatus.status?.isWaitingForResponse ? 'TAK' : 'NIE'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="status-loading">
          Ładowanie statusu RS Sender...
        </div>
      )}
    </div>
  );

  const MainView = () => {
    if (!data) {
      return (
        <div className="loading-container">
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <p>Ładowanie danych...</p>
          </div>
        </div>
      );
    }

    const filteredResults = filterResults(data.results);
    const show6Tiles = shouldShow6Tiles(filteredResults);
    const { frontKey, backKey } = getFrontBackKeys(filteredResults);
    
    const lewyValues = ensureTwoValues(filteredResults.lewy);
    const prawyValues = ensureTwoValues(filteredResults.prawy);
    const przodValues = filteredResults[frontKey] || [];
    const tylValues = filteredResults[backKey] || [];

    return (
      <div className="main-view-container">
        <div className="tiles-container">
          {show6Tiles ? (
            <div className="tiles-grid-6">
              <div className="tile-column">
                <Tile title="Left side" values={lewyValues} />
              </div>
              <div className="tile-column">
                <Tile title="Front Side" values={przodValues} />
                <Tile title="Back Side" values={tylValues} />
              </div>
              <div className="tile-column">
                <Tile title="Right Side" values={prawyValues} />
              </div>
            </div>
          ) : (
            <div className="tiles-grid-2">
              <Tile title="Left Side" values={lewyValues} />
              <Tile title="Right Side" values={prawyValues} />
            </div>
          )}
        </div>
        
        <div className="status-panel-container">
          <RsSenderStatusPanel />
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      <div className="connection-header">
        <div className="header-left">
          <img 
            src="SICK_logo_claim_blue_RGB.png" 
            alt="SICK Sensor Intelligence" 
            className="sick-logo"
          />
          
          <div className="view-switcher">
            {systemMode === 'rfid' ? (
              <button
                className={`view-btn ${activeView === 'rfid' ? 'active' : ''}`}
                onClick={() => setActiveView('rfid')}
              >
                RFID
              </button>
            ) : (
              <button
                className={`view-btn ${activeView === 'main' ? 'active' : ''}`}
                onClick={() => setActiveView('main')}
              >
                Lektory
              </button>
            )}
            <button
              className={`view-btn ${activeView === 'config' ? 'active' : ''}`}
              onClick={() => setActiveView('config')}
            >
              Konfiguracja
            </button>
            <button
              className={`view-btn ${activeView === 'rs' ? 'active' : ''}`}
              onClick={() => setActiveView('rs')}
            >
              RS Config
            </button>
          </div>

          <button className="style-toggle" onClick={toggleStyle}>
            {isIndustrial ? 'LIGHT MODE' : 'DARK MODE'}
          </button>
        </div>
        
        <div className="header-right">
          <div className="connection-status">
            <div className={`status-indicator ${isConnected ? 'status-connected' : 'status-disconnected'}`}></div>
            <span>{isConnected ? 'Connected' : 'Not Connected'}</span>
          </div>

          {lastUpdate && (
            <div className="last-update">
              Last Update: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {activeView === 'main' && <MainView />}
      {activeView === 'rfid' && <RfidView />}
      {activeView === 'config' && <SystemConfigTab systemMode={systemMode} />}
      {activeView === 'rs' && <RSConfigTab />}
    </div>
  );
}

export default App;

