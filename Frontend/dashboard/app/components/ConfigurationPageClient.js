'use client';

import { useEffect, useState } from 'react';
import { fetchJson, formatError } from '../lib/api';
import SynButton from './SynButton';

const defaultSystemConfig = {
  mode: 'rfid',
  tdc: {
    cycleTimeout: 5000,
    sendIncompleteData: true,
  },
  network: {
    rfidHead: { host: '', port: 2112, role: 'client' },
    cdf: { host: '', port: 4001, role: 'client' },
    ftp: { host: '', port: 21, role: 'client', username: 'SICK', password: 'SICK', remotePath: '/SICK' },
  },
  rfid: {
    expectedTags: 0,
    head: { id: 'RFID Head', host: '', port: 2112, role: 'client' },
  },
};

const FTP_FIXED_FIELDS = {
  role: 'client',
  remotePath: '/SICK',
};

function ConnectionSection({
  eyebrow,
  title,
  value,
  onChange,
  withCredentials = false,
  lockRole = false,
  lockCredentials = false,
  onPing,
  onReconnect,
  pingResult,
}) {
  return (
    <syn-card className="page-card">
      <div className="section-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <div className="action-row">
          <SynButton variant="outlined" onPress={onPing}>Ping</SynButton>
          <SynButton variant="outlined" onPress={onReconnect}>Reconnect</SynButton>
        </div>
      </div>

      <div className={`form-grid ${withCredentials ? 'is-four' : 'is-three'}`}>
        <label className="field">
          <span>Adres</span>
          <input value={value.host} onChange={(e) => onChange({ ...value, host: e.target.value })} />
        </label>
        <label className="field">
          <span>Port</span>
          <input
            type="number"
            value={value.port}
            onChange={(e) => onChange({ ...value, port: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="field">
          <span>Tryb polaczenia</span>
          <select
            value={value.role}
            onChange={(e) => onChange({ ...value, role: e.target.value })}
            disabled={lockRole}
          >
            <option value="client">Klient</option>
            <option value="server">Serwer</option>
          </select>
        </label>
        {withCredentials && (
          <>
            <label className="field">
              <span>Uzytkownik</span>
              <input
                value={value.username || ''}
                onChange={(e) => onChange({ ...value, username: e.target.value })}
                disabled={lockCredentials}
              />
            </label>
            <label className="field">
              <span>Haslo</span>
              <input
                type="password"
                value={value.password || ''}
                onChange={(e) => onChange({ ...value, password: e.target.value })}
                disabled={lockCredentials}
              />
            </label>
            <label className="field">
              <span>Remote path</span>
              <input
                value={value.remotePath || '/'}
                onChange={(e) => onChange({ ...value, remotePath: e.target.value })}
                disabled={lockCredentials}
              />
            </label>
          </>
        )}
      </div>

      {(lockRole || lockCredentials) && (
        <p className="muted-text">Wybrane parametry tego polaczenia sa stale i zablokowane do edycji.</p>
      )}

      {pingResult && (
        <div className={`inline-message ${pingResult.type}`}>
          ICMP: {pingResult.icmp} | TCP: {pingResult.tcp}
        </div>
      )}
    </syn-card>
  );
}

export default function ConfigurationPageClient() {
  const [formData, setFormData] = useState(defaultSystemConfig);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [pingResults, setPingResults] = useState({});

  const loadConfiguration = async () => {
    setLoading(true);
    setSaveStatus(null);
    try {
      const result = await fetchJson('/api/configuration');
      setFormData({
        ...defaultSystemConfig,
        ...result,
        tdc: { ...defaultSystemConfig.tdc, ...(result.tdc || {}) },
        network: {
          ...defaultSystemConfig.network,
          ...(result.network || {}),
          rfidHead: { ...defaultSystemConfig.network.rfidHead, ...(result.network?.rfidHead || {}) },
          cdf: { ...defaultSystemConfig.network.cdf, ...(result.network?.cdf || {}) },
          ftp: {
            ...defaultSystemConfig.network.ftp,
            ...(result.network?.ftp || {}),
            role: FTP_FIXED_FIELDS.role,
            remotePath: result.network?.ftp?.remotePath || FTP_FIXED_FIELDS.remotePath,
          },
        },
        rfid: {
          ...defaultSystemConfig.rfid,
          ...(result.rfid || {}),
          head: { ...defaultSystemConfig.rfid.head, ...(result.rfid?.head || {}) },
        },
      });
    } catch (error) {
      setSaveStatus({ type: 'error', message: `Blad pobierania konfiguracji: ${formatError(error)}` });
    } finally {
      setLoading(false);
    }
  };

  const pingConnection = async (key, host, port) => {
    try {
      const result = await fetchJson('/api/network/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port }),
      });
      if (!result.success) {
        throw new Error(result.error || 'Ping nieudany');
      }

      setPingResults((prev) => ({
        ...prev,
        [key]: {
          type: result.icmp?.ok || result.tcp?.ok ? 'success' : 'error',
          icmp: result.icmp?.ok ? `OK (${result.icmp.timeMs || 'n/a'} ms)` : 'Brak odpowiedzi',
          tcp: result.tcp?.ok === null ? result.tcp.message : result.tcp?.ok ? 'OK' : (result.tcp?.message || 'Blad'),
        },
      }));
    } catch (error) {
      setPingResults((prev) => ({
        ...prev,
        [key]: { type: 'error', icmp: 'Blad', tcp: formatError(error) },
      }));
    }
  };

  const reconnectConnection = async (target) => {
    try {
      const result = await fetchJson('/api/network/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      if (!result.success) {
        throw new Error(result.error || 'Reconnect nieudany');
      }
      setSaveStatus({ type: 'success', message: result.message });
    } catch (error) {
      setSaveStatus({ type: 'error', message: formatError(error) });
    }
  };

  const saveConfiguration = async () => {
    setLoading(true);
    setSaveStatus(null);
    try {
      const payload = {
        mode: 'rfid',
        tdc: formData.tdc,
        network: {
          ...formData.network,
          ftp: {
            ...formData.network.ftp,
            role: FTP_FIXED_FIELDS.role,
          },
        },
        rfid: {
          expectedTags: formData.rfid.expectedTags,
          head: {
            ...formData.rfid.head,
            host: formData.network.rfidHead.host,
            port: formData.network.rfidHead.port,
            role: formData.network.rfidHead.role,
          },
        },
      };

      const result = await fetchJson('/api/configuration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!result.success) {
        throw new Error(result.error || result.message || 'Nie udalo sie zapisac konfiguracji');
      }

      setSaveStatus({ type: 'success', message: 'Konfiguracja systemu zostala zapisana.' });
      await loadConfiguration();
    } catch (error) {
      setSaveStatus({ type: 'error', message: formatError(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfiguration();
  }, []);

  return (
    <div className="page-stack">
      <syn-card className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">System</p>
            <h3>Tryb pracy aplikacji</h3>
          </div>
          <div className="action-row">
            <SynButton variant="outlined" onPress={loadConfiguration}>
              Pobierz konfiguracje
            </SynButton>
            <SynButton variant="filled" onPress={saveConfiguration} disabled={loading}>
              Zapisz konfiguracje
            </SynButton>
          </div>
        </div>

        <div className="form-grid is-three">
          <label className="field">
            <span>Tryb</span>
            <input value="RFID only" disabled />
          </label>
          <label className="field">
            <span>Oczekiwana liczba tagow</span>
            <input
              type="number"
              value={formData.rfid.expectedTags}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  rfid: { ...prev.rfid, expectedTags: Number(e.target.value) || 0 },
                }))
              }
            />
          </label>
          <label className="field">
            <span>Timeout cyklu RFID (ms)</span>
            <input
              type="number"
              value={formData.tdc.cycleTimeout}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  tdc: { ...prev.tdc, cycleTimeout: Number(e.target.value) || 0 },
                }))
              }
            />
          </label>
        </div>

        <div className="toggle-row">
          <label className="check-field">
            <input
              type="checkbox"
              checked={Boolean(formData.tdc.sendIncompleteData)}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  tdc: { ...prev.tdc, sendIncompleteData: e.target.checked },
                }))
              }
            />
            <span>Wysylaj niepelne dane przez RS</span>
          </label>
        </div>

        {saveStatus && <div className={`inline-message ${saveStatus.type}`}>{saveStatus.message}</div>}
      </syn-card>

      <ConnectionSection
        eyebrow="RFID"
        title="Glowica RFID"
        value={formData.network.rfidHead}
        onPing={() => pingConnection('rfid', formData.network.rfidHead.host, formData.network.rfidHead.port)}
        onReconnect={() => reconnectConnection('rfid')}
        pingResult={pingResults.rfid}
        onChange={(value) =>
          setFormData((prev) => ({
            ...prev,
            network: { ...prev.network, rfidHead: value },
            rfid: { ...prev.rfid, head: { ...prev.rfid.head, ...value } },
          }))
        }
      />

      <ConnectionSection
        eyebrow="CDF"
        title="Skaner numeru partii"
        value={formData.network.cdf}
        onPing={() => pingConnection('cdf', formData.network.cdf.host, formData.network.cdf.port)}
        onReconnect={() => reconnectConnection('cdf')}
        pingResult={pingResults.cdf}
        onChange={(value) => setFormData((prev) => ({ ...prev, network: { ...prev.network, cdf: value } }))}
      />

      <ConnectionSection
        eyebrow="FTP"
        title="Serwer FTP"
        value={formData.network.ftp}
        onPing={() => pingConnection('ftp', formData.network.ftp.host, formData.network.ftp.port)}
        onReconnect={() => reconnectConnection('ftp')}
        pingResult={pingResults.ftp}
        onChange={(value) =>
          setFormData((prev) => ({
            ...prev,
            network: { ...prev.network, ftp: { ...value, role: FTP_FIXED_FIELDS.role } },
          }))
        }
        withCredentials
        lockRole
      />
    </div>
  );
}
