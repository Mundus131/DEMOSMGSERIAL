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
    fetchRsSenderMode();

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

// Główna aplikacja
function App() {
  const [data, setData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isIndustrial, setIsIndustrial] = useState(false);
  const [activeView, setActiveView] = useState('main');
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
    
    const existsInSide = (value) => {
      const inLeft = filtered.lewy?.includes(value);
      const inRight = filtered.prawy?.includes(value);
      return inLeft || inRight;
    };
    
    if (filtered.przód && filtered.przód.length > 0) {
      const frontValue = filtered.przód[0];
      if (frontValue !== "NoRead" && existsInSide(frontValue)) {
        filtered.przód = ["NoRead"];
      }
    }
    
    if (filtered.tył && filtered.tył.length > 0) {
      const backValue = filtered.tył[0];
      if (backValue !== "NoRead" && existsInSide(backValue)) {
        filtered.tył = ["NoRead"];
      }
    }
    
    return filtered;
  };

  const shouldShow6Tiles = (filteredResults) => {
    if (!filteredResults) return false;
    
    const przod = filteredResults.przód || [];
    const tyl = filteredResults.tył || [];
    
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
    
    const lewyValues = ensureTwoValues(filteredResults.lewy);
    const prawyValues = ensureTwoValues(filteredResults.prawy);
    const przodValues = filteredResults.przód || [];
    const tylValues = filteredResults.tył || [];

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
            <button 
              className={`view-btn ${activeView === 'main' ? 'active' : ''}`}
              onClick={() => setActiveView('main')}
            >
              Lektory
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
      {activeView === 'rs' && <RSConfigTab />}
    </div>
  );
}

export default App;