'use client';

import { useEffect, useState } from 'react';
import { fetchJson, formatError } from '../lib/api';
import SynButton from './SynButton';

const defaultRsConfig = {
  path: '',
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  mode: 'RS232',
};

const RS_MODE_OPTIONS = ['RS232', 'RS422', 'RS485'];

function Kpi({ label, value }) {
  return (
    <div className="status-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function pickPreferredPath(runtime, currentPath, previousPath) {
  const ports = runtime?.serialPorts || [];
  const available = ports.map((port) => port.path);
  const candidate = previousPath || currentPath || '';

  if (candidate && available.includes(candidate)) {
    return candidate;
  }

  if (runtime?.platform === 'win32' && typeof candidate === 'string' && candidate.startsWith('/dev/')) {
    return available[0] || '';
  }

  if (runtime?.platform !== 'win32' && /^COM\d+$/i.test(candidate || '')) {
    return available[0] || '';
  }

  return candidate || available[0] || '';
}

export default function RsPageClient() {
  const [configData, setConfigData] = useState(defaultRsConfig);
  const [runtime, setRuntime] = useState(null);
  const [rsStatus, setRsStatus] = useState(null);
  const [rsData, setRsData] = useState([]);
  const [senderMode, setSenderMode] = useState('separate');
  const [senderTimeout, setSenderTimeout] = useState(1000);
  const [senderDetailedStatus, setSenderDetailedStatus] = useState(null);
  const [sendValue, setSendValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const loadRuntime = async () => {
    const result = await fetchJson('/api/rs/system');
    if (result.success) {
      setRuntime(result.runtime);
      setConfigData((prev) => ({
        ...prev,
        ...(result.runtime.currentConfig || {}),
        path: pickPreferredPath(result.runtime, result.runtime.currentConfig?.path, prev.path),
      }));
    }
  };

  const loadRsConfig = async () => {
    const result = await fetchJson('/api/rs/config');
    if (result.success) {
      setConfigData({
        ...defaultRsConfig,
        ...(result.config?.serial || {}),
        path: pickPreferredPath(runtime, result.config?.serial?.path, ''),
      });
    }
  };

  const loadRsStatus = async () => {
    const [statusResult, readResult, modeResult, timeoutResult, senderDetailedResult] = await Promise.allSettled([
      fetchJson('/api/rs/status'),
      fetchJson('/api/rs/read'),
      fetchJson('/api/tdc/rs-sender/mode'),
      fetchJson('/api/tdc/rs-sender/timeout'),
      fetchJson('/api/tdc/rs-sender/status/detailed'),
    ]);

    if (statusResult.status === 'fulfilled' && statusResult.value.success) setRsStatus(statusResult.value.status);
    if (readResult.status === 'fulfilled' && readResult.value.success) {
      setRsData((prev) => [readResult.value.data, ...prev].filter(Boolean).slice(0, 20));
    }
    if (modeResult.status === 'fulfilled' && modeResult.value.success) setSenderMode(modeResult.value.currentMode);
    if (timeoutResult.status === 'fulfilled' && timeoutResult.value.success) setSenderTimeout(timeoutResult.value.timeoutMs);
    if (senderDetailedResult.status === 'fulfilled' && senderDetailedResult.value.success) setSenderDetailedStatus(senderDetailedResult.value);
  };

  const loadAll = async () => {
    try {
      await Promise.allSettled([loadRuntime(), loadRsConfig(), loadRsStatus()]);
      setMessage(null);
    } catch (error) {
      setMessage({ type: 'error', text: formatError(error) });
    }
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadRsStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const saveRsConfig = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await fetchJson('/api/rs/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData),
      });
      if (!result.success) {
        throw new Error(result.error || 'Nie udalo sie zapisac konfiguracji RS');
      }
      setMessage({ type: 'success', text: 'Konfiguracja RS zostala zapisana.' });
      await loadAll();
    } catch (error) {
      setMessage({ type: 'error', text: formatError(error) });
    } finally {
      setLoading(false);
    }
  };

  const restartRs = async () => {
    try {
      await fetchJson('/api/rs/restart', { method: 'POST' });
      await loadRsStatus();
    } catch (error) {
      setMessage({ type: 'error', text: formatError(error) });
    }
  };

  const saveSenderMode = async (mode) => {
    setSenderMode(mode);
    try {
      await fetchJson('/api/tdc/rs-sender/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      await loadRsStatus();
    } catch (error) {
      setMessage({ type: 'error', text: formatError(error) });
    }
  };

  const saveSenderTimeout = async () => {
    try {
      await fetchJson('/api/tdc/rs-sender/timeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: Number(senderTimeout) || 0 }),
      });
      await loadRsStatus();
    } catch (error) {
      setMessage({ type: 'error', text: formatError(error) });
    }
  };

  const sendRsData = async () => {
    try {
      await fetchJson('/api/rs/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: sendValue }),
      });
      setSendValue('');
      await loadRsStatus();
    } catch (error) {
      setMessage({ type: 'error', text: formatError(error) });
    }
  };

  return (
    <div className="page-stack">
      <syn-card className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">System</p>
            <h3>Wykryte srodowisko i porty</h3>
          </div>
          <SynButton variant="outlined" onPress={loadAll}>
            Odswiez
          </SynButton>
        </div>

        <div className="status-grid compact">
          <Kpi label="Platforma" value={runtime?.platform || '-'} />
          <Kpi label="Architektura" value={runtime?.arch || '-'} />
          <Kpi label="Hostname" value={runtime?.hostname || '-'} />
        </div>

        <div className="reader-list">
          {(runtime?.serialPorts || []).length === 0 && <p className="muted-text">Nie wykryto portow szeregowych.</p>}
          {(runtime?.serialPorts || []).map((port) => (
            <div key={port.path} className="io-item">
              <span>{port.friendlyName || port.path}</span>
              <SynButton variant="text" onPress={() => setConfigData((prev) => ({ ...prev, path: port.path }))}>
                Wybierz
              </SynButton>
            </div>
          ))}
        </div>
      </syn-card>

      <syn-card className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">RS</p>
            <h3>Interfejs i parametry transmisji</h3>
          </div>
          <div className="action-row">
            <SynButton variant="outlined" onPress={restartRs}>
              Restart portu
            </SynButton>
            <SynButton variant="filled" onPress={saveRsConfig} disabled={loading}>
              Zapisz konfiguracje
            </SynButton>
          </div>
        </div>

        <div className="form-grid is-three">
          <label className="field">
            <span>Port szeregowy</span>
            <select value={configData.path} onChange={(e) => setConfigData((prev) => ({ ...prev, path: e.target.value }))}>
              <option value="">Wybierz port</option>
              {(runtime?.serialPorts || []).map((port) => (
                <option key={port.path} value={port.path}>
                  {port.path}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Baud rate</span>
            <input value={configData.baudRate} onChange={(e) => setConfigData((prev) => ({ ...prev, baudRate: Number(e.target.value) || 0 }))} />
          </label>
          <label className="field">
            <span>Data bits</span>
            <input value={configData.dataBits} onChange={(e) => setConfigData((prev) => ({ ...prev, dataBits: Number(e.target.value) || 0 }))} />
          </label>
          <label className="field">
            <span>Stop bits</span>
            <input value={configData.stopBits} onChange={(e) => setConfigData((prev) => ({ ...prev, stopBits: Number(e.target.value) || 0 }))} />
          </label>
          <label className="field">
            <span>Parity</span>
            <select value={configData.parity} onChange={(e) => setConfigData((prev) => ({ ...prev, parity: e.target.value }))}>
              <option value="none">None</option>
              <option value="even">Even</option>
              <option value="odd">Odd</option>
            </select>
          </label>
          <label className="field">
            <span>Tryb RS</span>
            <select
              value={RS_MODE_OPTIONS.includes(configData.mode) ? configData.mode : 'RS232'}
              onChange={(e) => setConfigData((prev) => ({ ...prev, mode: e.target.value }))}
            >
              {RS_MODE_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="status-grid compact">
          <Kpi label="Port otwarty" value={rsStatus?.isOpen ? 'TAK' : 'NIE'} />
          <Kpi label="Wybrany port" value={configData.path || '-'} />
          <Kpi label="Ostatnia ramka" value={rsStatus?.lastDataLength || 0} />
        </div>
      </syn-card>

      <syn-card className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">RS Sender</p>
            <h3>Potwierdzenia i ponowienia wysylki</h3>
          </div>
        </div>

        <div className="form-grid is-two">
          <label className="field">
            <span>Tryb wysylki</span>
            <select value={senderMode} onChange={(e) => saveSenderMode(e.target.value)}>
              <option value="separate">Separate</option>
              <option value="combined">Combined</option>
            </select>
          </label>
          <label className="field">
            <span>Timeout odpowiedzi (ms)</span>
            <div className="inline-field">
              <input value={senderTimeout} onChange={(e) => setSenderTimeout(e.target.value)} />
              <SynButton variant="filled" onPress={saveSenderTimeout}>
                Zapisz
              </SynButton>
            </div>
          </label>
        </div>

        <div className="status-grid compact">
          <Kpi label="Status" value={senderDetailedStatus?.message || 'Brak danych'} />
          <Kpi label="Wysylanie" value={senderDetailedStatus?.status?.isSending ? 'TAK' : 'NIE'} />
          <Kpi label="Oczekiwanie" value={senderDetailedStatus?.status?.isWaitingForResponse ? 'TAK' : 'NIE'} />
        </div>
      </syn-card>

      <syn-card className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Monitor</p>
            <h3>Podglad komunikacji RS</h3>
          </div>
        </div>

        <div className="inline-field">
          <input value={sendValue} onChange={(e) => setSendValue(e.target.value)} placeholder="Wpisz testowa ramke do wyslania" />
          <SynButton variant="filled" onPress={sendRsData} disabled={!sendValue}>
            Wyslij
          </SynButton>
        </div>

        <div className="log-list">
          {rsData.length === 0 && <p className="muted-text">Brak danych z portu RS.</p>}
          {rsData.map((item, index) => (
            <div key={`rs-${index}`} className="log-row">
              <span>{item?.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '--:--:--'}</span>
              <code>{item?.lastData || item?.data || 'Brak danych'}</code>
            </div>
          ))}
        </div>

        {message && <div className={`inline-message ${message.type}`}>{message.text}</div>}
      </syn-card>
    </div>
  );
}
