'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL, fetchJson, formatError } from '../lib/api';
import useBackendEvents from '../lib/useBackendEvents';
import SynButton from './SynButton';

function Kpi({ label, value, valueClassName = '' }) {
  return (
    <div className="status-kpi">
      <span>{label}</span>
      <strong className={valueClassName}>{value}</strong>
    </div>
  );
}

function formatPhotoDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function DashboardPageClient() {
  const [sessionStatus, setSessionStatus] = useState(null);
  const [cdfStatus, setCdfStatus] = useState(null);
  const [senderStatus, setSenderStatus] = useState(null);
  const [lastCycle, setLastCycle] = useState(null);
  const [rfidStatus, setRfidStatus] = useState(null);
  const [manualBatchNumber, setManualBatchNumber] = useState('');
  const [dialogBatchNumber, setDialogBatchNumber] = useState('');
  const [message, setMessage] = useState(null);
  const [summary, setSummary] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [summaryImagePage, setSummaryImagePage] = useState(0);
  const [loading, setLoading] = useState(false);
  const promptDialogRef = useRef(null);
  const summaryDialogRef = useRef(null);
  const previewDialogRef = useRef(null);

  const loadDashboardData = async () => {
    try {
      const [sessionResult, cdfResult, senderResult, rfidResult] = await Promise.allSettled([
        fetchJson('/api/load-session/status'),
        fetchJson('/api/cdf/status'),
        fetchJson('/api/tdc/rs-sender/status/detailed'),
        fetchJson('/api/rfid/status'),
      ]);

      if (sessionResult.status === 'fulfilled' && sessionResult.value.success) {
        setSessionStatus(sessionResult.value);
      }
      if (cdfResult.status === 'fulfilled' && cdfResult.value.success) {
        setCdfStatus(cdfResult.value.status);
        if (cdfResult.value.status?.lastBatchNumber === '') {
          setManualBatchNumber('');
        } else if (!manualBatchNumber && cdfResult.value.status?.lastSource) {
          setManualBatchNumber(cdfResult.value.status.lastBatchNumber || '');
        }
      }
      if (senderResult.status === 'fulfilled' && senderResult.value.success) {
        setSenderStatus(senderResult.value);
      }
      if (rfidResult.status === 'fulfilled' && rfidResult.value.success) {
        setRfidStatus(rfidResult.value.status);
      }
    } catch (error) {
      setMessage({ type: 'error', text: formatError(error) });
    }
  };

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const source = new EventSource(`${API_BASE_URL}/api/rfid/events`);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setLastCycle(payload);
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
      setSessionStatus((payload?.loadSession && { success: true, ...payload.loadSession }) || null);
      setCdfStatus(payload?.cdf || null);
      setRfidStatus(payload?.rfid || null);
      return;
    }
    if (type === 'rfid.status') {
      setRfidStatus(payload || null);
      return;
    }
    if (type === 'rfid.cycle') {
      setLastCycle(payload || null);
      return;
    }
    if (type === 'cdf.status') {
      setCdfStatus(payload || null);
      if (payload?.lastBatchNumber === '') {
        setManualBatchNumber('');
      } else if (!manualBatchNumber && payload?.lastSource) {
        setManualBatchNumber(payload.lastBatchNumber || '');
      }
      return;
    }
    if (type === 'loadSession.status') {
      setSessionStatus((payload && { success: true, ...payload }) || null);
    }
  });

  const persistManualBatch = async (batchNumber) => {
    await fetchJson('/api/cdf/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchNumber }),
    });
  };

  const startLoading = async (batchNumber) => {
    setLoading(true);
    setMessage(null);
    try {
      const normalized = String(batchNumber || '').trim();
      if (!normalized) {
        promptDialogRef.current?.show();
        return;
      }

      await persistManualBatch(normalized);
      const result = await fetchJson('/api/load-session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchNumber: normalized }),
      });

      if (!result.success) {
        throw new Error(result.error || 'Nie udalo sie uruchomic zaladunku');
      }

      setSessionStatus(result);
      setMessage({ type: 'success', text: `Rozpoczeto zaladunek dla partii ${normalized}.` });
      setDialogBatchNumber('');
      promptDialogRef.current?.hide();
      await loadDashboardData();
    } catch (error) {
      setMessage({ type: 'error', text: formatError(error) });
    } finally {
      setLoading(false);
    }
  };

  const stopLoading = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await fetchJson('/api/load-session/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!result.success) {
        throw new Error(result.error || 'Nie udalo sie zatrzymac zaladunku');
      }

      setSummary(result.summary);
      setSummaryImagePage(0);
      setSessionStatus(result);
      summaryDialogRef.current?.show();
      await loadDashboardData();
    } catch (error) {
      setMessage({ type: 'error', text: formatError(error) });
    } finally {
      setLoading(false);
    }
  };

  const saveManualBatchOnly = async () => {
    setLoading(true);
    setMessage(null);
    try {
      if (!manualBatchNumber.trim()) {
        throw new Error('Podaj numer partii');
      }
      const result = await fetchJson('/api/cdf/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchNumber: manualBatchNumber }),
      });
      if (!result.success) {
        throw new Error(result.error || 'Nie udalo sie zapisac numeru partii');
      }
      setCdfStatus(result.status);
      setMessage({ type: 'success', text: 'Numer partii zapisany.' });
    } catch (error) {
      setMessage({ type: 'error', text: formatError(error) });
    } finally {
      setLoading(false);
    }
  };

  const currentBatch = sessionStatus?.session?.batchNumber || cdfStatus?.lastBatchNumber || '';
  const reader = rfidStatus?.readers?.[0];
  const session = sessionStatus?.session;
  const latestTagsRaw = [
    ...((lastCycle?.uniqueCodes?.length ? lastCycle.uniqueCodes : reader?.lastRead?.tags) || []),
    ...((session?.recentReads || [])),
  ];
  const latestTags = Array.from(new Set(latestTagsRaw.filter((tag) => {
    const normalized = String(tag || '').trim().toLowerCase();
    return normalized && normalized !== 'noread' && normalized !== 'norread';
  })));
  const cycleExpected = Number(lastCycle?.expectedCount || sessionStatus?.session?.expectedCount || 0 || 0);
  const cycleCount = Number(
    lastCycle?.uniqueCount
      ? latestTags.length
      : latestTags.length || 0
  );
  const cycleGood = lastCycle ? Boolean(lastCycle.goodRead) : cycleCount > 0;
  const dashboardStateClass = lastCycle
    ? (cycleGood ? 'operator-dashboard-frame--good' : 'operator-dashboard-frame--bad')
    : 'operator-dashboard-frame--idle';
  const innerStatusClass = lastCycle
    ? (cycleGood ? 'dashboard-card-state--good' : 'dashboard-card-state--bad')
    : 'dashboard-card-state--idle';
  const summaryImages = [...(summary?.images || [])].sort((left, right) => {
    const leftTime = new Date(left?.modifiedAt || 0).getTime();
    const rightTime = new Date(right?.modifiedAt || 0).getTime();
    return rightTime - leftTime;
  });
  const summaryImagePageSize = 4;
  const summaryImagePageCount = Math.max(1, Math.ceil(summaryImages.length / summaryImagePageSize));
  const currentSummaryImages = summaryImages.slice(
    summaryImagePage * summaryImagePageSize,
    summaryImagePage * summaryImagePageSize + summaryImagePageSize
  );
  const summaryTagSourceMap = new Map();
  (summary?.cycles || []).forEach((cycle) => {
    (cycle?.uniqueCodes || []).forEach((code) => {
      const normalized = String(code || '').trim();
      if (!normalized) {
        return;
      }
      const currentSource = summaryTagSourceMap.get(normalized);
      if (!currentSource) {
        summaryTagSourceMap.set(normalized, 'RFID');
      } else if (!String(currentSource).includes('RFID')) {
        summaryTagSourceMap.set(normalized, `${currentSource} + RFID`);
      }
    });
  });
  (summary?.externalReads || []).forEach((entry) => {
    const normalized = String(entry?.code || '').trim();
    if (!normalized) {
      return;
    }
    const sourceLabel = String(entry?.source || 'CDF').toUpperCase();
    const currentSource = summaryTagSourceMap.get(normalized);
    if (!currentSource) {
      summaryTagSourceMap.set(normalized, sourceLabel);
    } else if (!String(currentSource).includes(sourceLabel)) {
      summaryTagSourceMap.set(normalized, `${currentSource} + ${sourceLabel}`);
    }
  });
  const summaryTagRows = (summary?.uniqueTags || [])
    .filter((tag) => {
      const normalized = String(tag || '').trim().toLowerCase();
      return normalized && normalized !== 'noread' && normalized !== 'norread';
    })
    .map((tag, index) => ({
      index: index + 1,
      code: tag,
      source: summaryTagSourceMap.get(tag) || 'RFID',
    }));

  const openImagePreview = (image) => {
    setPreviewImage(image || null);
    previewDialogRef.current?.show();
  };

  return (
    <div className={`operator-dashboard-frame ${dashboardStateClass}`}>
      <div className="operator-mode-corner">
        <syn-badge variant={session?.active ? 'success' : 'danger'}>
          {session?.active ? 'Zaladunek aktywny' : 'Brak zaladunku'}
        </syn-badge>
      </div>
      <div className="page-stack operator-dashboard">
        <syn-card className={`page-card operator-dashboard__control ${innerStatusClass}`}>
          <div className="section-header">
            <div>
              <p className="eyebrow">Sterowanie</p>
              <h3>Start i stop zaladunku</h3>
            </div>
            <div className="action-row operator-action-row">
              <SynButton
                className="operator-action-button operator-action-button--start"
                variant="filled"
                disabled={loading}
                onPress={() => startLoading(currentBatch || manualBatchNumber)}
              >
                Start zaladunku
              </SynButton>
              <SynButton
                className="operator-action-button operator-action-button--stop"
                variant="outline"
                disabled={loading || !session?.active}
                onPress={stopLoading}
              >
                Stop zaladunku
              </SynButton>
            </div>
          </div>

          <div className="form-grid is-two">
            <label className="field">
              <span>Numer partii z CDF lub recznie</span>
              <input value={manualBatchNumber} onChange={(e) => setManualBatchNumber(e.target.value)} placeholder="Wpisz lub pobierz numer partii" />
            </label>
            <div className="field">
              <span>Akcje</span>
              <div className="action-row">
                <SynButton variant="outlined" onPress={saveManualBatchOnly} disabled={loading}>
                  Zapisz numer partii
                </SynButton>
                <SynButton variant="outlined" onPress={loadDashboardData}>
                  Odswiez status
                </SynButton>
              </div>
            </div>
          </div>

          <div className="status-grid compact operator-kpi-grid">
            <Kpi label="CDF" value={cdfStatus?.connectionState || 'unknown'} />
            <Kpi label="Aktywna partia" value={session?.batchNumber || 'brak'} />
            <Kpi label="Suma unikalnych tagow" value={session?.uniqueTags?.length || 0} />
            <Kpi label="Zrodlo partii" value={cdfStatus?.lastSource || '-'} />
          </div>

          {message && <div className={`inline-message ${message.type}`}>{message.text}</div>}
        </syn-card>

        <syn-card className={`page-card cycle-card operator-dashboard__rfid ${innerStatusClass} ${cycleGood ? 'is-good' : 'is-bad'}`}>
          <div className="section-header">
            <div>
              <p className="eyebrow">Ostatni odczyt</p>
              <h3>Stan glowicy RFID</h3>
            </div>
            <syn-tag size="small">{cycleGood ? 'Poprawny odczyt' : 'Niepelny odczyt'}</syn-tag>
          </div>

          <div className="status-grid compact operator-kpi-grid">
            <Kpi label="Odczytane tagi" value={cycleCount} />
            <Kpi label="Oczekiwane tagi" value={cycleExpected || 'brak'} />
            <Kpi
              label="Wynik"
              value={lastCycle ? (cycleGood ? 'OK' : 'NG') : 'Brak danych'}
            />
            <Kpi label="Ostatni odczyt" value={reader?.lastRead?.timestamp ? new Date(reader.lastRead.timestamp).toLocaleTimeString() : '-'} />
          </div>

          <div className="tag-row">
            {latestTags.length === 0 && <span className="muted-text">Brak tagow z ostatniego odczytu.</span>}
            {latestTags.map((tag, index) => (
              <syn-badge key={`${tag}-${index}`} variant="primary">
                {tag}
              </syn-badge>
            ))}
          </div>
        </syn-card>

        <syn-card className={`status-card operator-dashboard__rs ${innerStatusClass}`}>
          <div className="status-card__header">
            <div>
              <p className="eyebrow">RS</p>
              <h3>Automatyczna wysylka po RFID</h3>
            </div>
          </div>
          <div className="status-grid operator-kpi-grid">
            <Kpi label="Status" value={senderStatus?.message || 'Brak danych'} />
            <Kpi label="Wysylanie" value={senderStatus?.status?.isSending ? 'TAK' : 'NIE'} />
            <Kpi label="Oczekiwanie" value={senderStatus?.status?.isWaitingForResponse ? 'TAK' : 'NIE'} />
            <Kpi label="Kod biezacy" value={senderStatus?.status?.currentCode || '-'} valueClassName="status-kpi__value--wrap" />
          </div>
        </syn-card>
      </div>

      <syn-dialog ref={promptDialogRef} label="Brak numeru partii">
        <p>Przed startem zaladunku podaj numer partii recznie.</p>
        <label className="field dialog-field">
          <span>Numer partii</span>
          <input value={dialogBatchNumber} onChange={(e) => setDialogBatchNumber(e.target.value)} placeholder="Wpisz numer partii" />
        </label>
        <span slot="footer"></span>
        <SynButton slot="footer" variant="outlined" onPress={() => promptDialogRef.current?.hide()}>
          Anuluj
        </SynButton>
        <SynButton slot="footer" variant="filled" onPress={() => startLoading(dialogBatchNumber)}>
          Start zaladunku
        </SynButton>
        <span slot="footer"></span>
      </syn-dialog>

      <syn-dialog ref={summaryDialogRef} label="Podsumowanie zaladunku">
        <div className="summary-layout">
          <div className="summary-layout__left">
            <div className="dialog-summary summary-card">
              <p><strong>Numer partii:</strong> {summary?.batchNumber || '-'}</p>
              <p><strong>Liczba cykli RFID:</strong> {summary?.cycleCount || 0}</p>
              <p><strong>Suma odczytanych tagow:</strong> {summary?.totalReads || 0}</p>
              <p><strong>Liczba unikalnych tagow:</strong> {summary?.uniqueTagCount || 0}</p>
              <p><strong>Liczba zdjec FTP:</strong> {summary?.imageCount || 0}</p>
              {summary?.ftpCapture?.message && <p><strong>FTP:</strong> {summary.ftpCapture.message}</p>}
            </div>

            <div className="summary-gallery-wrap">
              <div className="summary-gallery">
                {currentSummaryImages.length === 0 && (
                  <span className="muted-text">Brak zdjec FTP zapisanych dla tej sesji.</span>
                )}
                {currentSummaryImages.map((image, index) => (
                  <button
                    key={`${image.url}-${index}`}
                    type="button"
                    className="summary-gallery__item"
                    onClick={() => openImagePreview(image)}
                  >
                    <img src={`${API_BASE_URL}${image.url}`} alt={image.name || `Zdjecie ${index + 1}`} />
                    <span className="summary-gallery__name">{image.name || `Zdjecie ${index + 1}`}</span>
                    <span className="summary-gallery__time">{formatPhotoDateTime(image.modifiedAt)}</span>
                  </button>
                ))}
              </div>
              {summaryImagePageCount > 1 && (
                <div className="summary-gallery__pagination">
                  <SynButton
                    variant="outline"
                    size="small"
                    disabled={summaryImagePage === 0}
                    onPress={() => setSummaryImagePage((current) => Math.max(0, current - 1))}
                  >
                    Poprzednie
                  </SynButton>
                  <span>
                    Strona {summaryImagePage + 1} / {summaryImagePageCount}
                  </span>
                  <SynButton
                    variant="outline"
                    size="small"
                    disabled={summaryImagePage >= summaryImagePageCount - 1}
                    onPress={() => setSummaryImagePage((current) => Math.min(summaryImagePageCount - 1, current + 1))}
                  >
                    Nastepne
                  </SynButton>
                </div>
              )}
            </div>
          </div>

          <div className="summary-layout__right">
            <div className="summary-table-wrap">
              <table className="syn-table--default summary-tags-table">
                <thead>
                  <tr>
                    <th>LP</th>
                    <th>Tag</th>
                    <th>Zrodlo</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryTagRows.length === 0 && (
                    <tr>
                      <td colSpan="3" className="summary-tags-table__empty">Brak zapisanych tagow dla tej sesji.</td>
                    </tr>
                  )}
                  {summaryTagRows.map((row) => (
                    <tr key={`${row.code}-${row.index}`}>
                      <td>{row.index}</td>
                      <td>{row.code}</td>
                      <td>{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <span slot="footer"></span>
        <SynButton slot="footer" variant="filled" onPress={() => summaryDialogRef.current?.hide()}>
          Zamknij
        </SynButton>
        <span slot="footer"></span>
      </syn-dialog>

      <syn-dialog ref={previewDialogRef} label="Podglad zdjecia" className="image-preview-dialog">
        <div className="image-preview">
          {previewImage && (
            <>
              <div className="image-preview__meta">
                <strong>{previewImage.name || 'Zdjecie z FTP'}</strong>
                <span>{formatPhotoDateTime(previewImage.modifiedAt)}</span>
              </div>
              <div className="image-preview__canvas">
                <img
                  src={`${API_BASE_URL}${previewImage.url}`}
                  alt={previewImage.name || 'Zdjecie z FTP'}
                />
              </div>
            </>
          )}
        </div>
        <span slot="footer"></span>
        <SynButton
          slot="footer"
          variant="outline"
          onPress={() => window.open(`${API_BASE_URL}${previewImage?.url || ''}`, '_blank', 'noopener,noreferrer')}
          disabled={!previewImage}
        >
          Otworz w nowej karcie
        </SynButton>
        <SynButton slot="footer" variant="filled" onPress={() => previewDialogRef.current?.hide()}>
          Zamknij
        </SynButton>
        <span slot="footer"></span>
      </syn-dialog>
    </div>
  );
}
