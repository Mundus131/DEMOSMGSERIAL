'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL, fetchJson } from '../lib/api';
import useBackendEvents from '../lib/useBackendEvents';

function Kpi({ label, value }) {
  return (
    <div className="status-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function RfidPageClient() {
  const [status, setStatus] = useState(null);
  const [sessionStatus, setSessionStatus] = useState(null);
  const [lastCycle, setLastCycle] = useState(null);

  const loadData = async () => {
    try {
      const [statusResult, sessionResult] = await Promise.all([
        fetchJson('/api/rfid/status'),
        fetchJson('/api/load-session/status'),
      ]);

      if (statusResult.success) setStatus(statusResult.status);
      if (sessionResult.success) setSessionStatus(sessionResult);
    } catch (error) {
      console.error('RFID load error:', error);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const source = new EventSource(`${API_BASE_URL}/api/rfid/events`);
    source.onmessage = (event) => {
      try {
        setLastCycle(JSON.parse(event.data));
      } catch (error) {
        console.error('RFID event parse error:', error);
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, []);

  useBackendEvents((event) => {
    const { type, payload } = event || {};
    if (type === 'snapshot') {
      if (payload?.rfid) setStatus(payload.rfid);
      if (payload?.loadSession) setSessionStatus({ success: true, ...payload.loadSession });
      return;
    }
    if (type === 'rfid.status') {
      setStatus(payload || null);
      return;
    }
    if (type === 'rfid.cycle') {
      setLastCycle(payload || null);
      return;
    }
    if (type === 'loadSession.status') {
      setSessionStatus((payload && { success: true, ...payload }) || null);
    }
  });

  const reader = status?.readers?.[0];
  const tags = (lastCycle?.uniqueCodes?.length ? lastCycle.uniqueCodes : reader?.lastRead?.tags) || [];

  return (
    <div className="page-stack">
      <syn-card className={`page-card cycle-card ${lastCycle?.goodRead ? 'is-good' : 'is-bad'}`}>
        <div className="section-header">
          <div>
            <p className="eyebrow">RFID</p>
            <h3>Ostatni cykl odczytu</h3>
          </div>
          <syn-tag size="small">{lastCycle?.goodRead ? 'OK' : 'NG'}</syn-tag>
        </div>

        <div className="status-grid compact">
          <Kpi label="Tagi" value={lastCycle?.uniqueCount || reader?.lastRead?.tags?.length || 0} />
          <Kpi label="Oczekiwane" value={lastCycle?.expectedCount || 0} />
          <Kpi label="Sesja" value={sessionStatus?.session?.active ? 'Aktywna' : 'Brak'} />
          <Kpi label="Ostatni odczyt" value={reader?.lastRead?.timestamp ? new Date(reader.lastRead.timestamp).toLocaleTimeString() : '-'} />
        </div>

        <div className="tag-row">
          {tags.length === 0 && <span className="muted-text">Brak tagow z ostatniego cyklu.</span>}
          {tags.map((tag, index) => (
            <syn-tag key={`${tag}-${index}`} size="small">
              {tag}
            </syn-tag>
          ))}
        </div>
      </syn-card>

      <syn-card className="rfid-card">
        <div className="rfid-card__header">
          <div>
            <h3>{reader?.id || 'RFID Head'}</h3>
            <p>{reader ? `${reader.ip}:${reader.port}` : 'Brak konfiguracji glowicy'}</p>
          </div>
          <syn-tag size="small">{reader?.role || 'client'}</syn-tag>
        </div>
        <div className="status-grid compact">
          <Kpi label="Cykl aktywny" value={status?.active ? 'TAK' : 'NIE'} />
          <Kpi label="Ostatni odczyt" value={reader?.lastRead?.timestamp ? new Date(reader.lastRead.timestamp).toLocaleTimeString() : '-'} />
          <Kpi label="Tagi z glowicy" value={reader?.lastRead?.tags?.length || 0} />
        </div>
        <div className="tag-row">
          {tags.length === 0 && <span className="muted-text">Brak tagow z ostatniej ramki.</span>}
          {tags.map((tag, index) => (
            <syn-tag key={`${tag}-${index}`} size="small">
              {tag}
            </syn-tag>
          ))}
        </div>
      </syn-card>
    </div>
  );
}
