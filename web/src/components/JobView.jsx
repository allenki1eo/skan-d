import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const CONCURRENCY = 6;

export default function JobView({ jobId, devices, deviceId, setDeviceId, onBack }) {
  const [job, setJob] = useState(null);
  const [mode, setMode] = useState('confirm');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const cancelRef = useRef(false);

  async function refresh() {
    try {
      setJob(await api.getJob(jobId));
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    refresh();
    return () => {
      cancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  function setBaleStatus(id, status, message) {
    setJob((j) => (j ? { ...j, bales: j.bales.map((b) => (b.id === id ? { ...b, status, error: message } : b)) } : j));
  }

  async function run() {
    if (!deviceId) {
      alert('Select a device first.');
      return;
    }
    const targets = job.bales.filter((b) => ['pending', 'error', 'checked'].includes(b.status));
    if (!targets.length) return;

    cancelRef.current = false;
    setRunning(true);
    const counters = { done: 0, total: targets.length, confirmed: 0, already: 0, errors: 0 };
    setProgress({ ...counters });

    let index = 0;
    async function worker() {
      while (index < targets.length && !cancelRef.current) {
        const bale = targets[index++];
        try {
          const r = await api.confirmBale({ deviceId, data: bale.data, mode, jobId, baleId: bale.id });
          setBaleStatus(bale.id, r.status, r.message);
          if (r.status === 'confirmed') counters.confirmed++;
          else if (r.status === 'already') counters.already++;
          else if (r.status === 'error') counters.errors++;
        } catch (err) {
          setBaleStatus(bale.id, 'error', err.message);
          counters.errors++;
        }
        counters.done++;
        setProgress({ ...counters });
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
    refresh();
  }

  if (!job) return <div className="page">Loading…</div>;

  const counts = job.bales.reduce((a, b) => ((a[b.status] = (a[b.status] || 0) + 1), a), {});
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const firstError = job.bales.find((b) => b.status === 'error' && b.error)?.error;

  return (
    <div className="page">
      <button className="link" onClick={onBack}>
        ← Jobs
      </button>
      <h2>{job.name}</h2>

      <div className="run-bar card">
        <div className="run-row">
          <select value={deviceId || ''} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">Select device…</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} {d.checkPointName ? `(${d.checkPointName})` : ''}
              </option>
            ))}
          </select>
          <div className="segmented small">
            <button className={mode === 'confirm' ? 'on' : ''} onClick={() => setMode('confirm')}>
              Confirm
            </button>
            <button className={mode === 'check' ? 'on' : ''} onClick={() => setMode('check')}>
              Check only
            </button>
          </div>
        </div>
        {running ? (
          <button className="big" onClick={() => (cancelRef.current = true)}>
            Stop
          </button>
        ) : (
          <button className="big" onClick={run}>
            {mode === 'confirm' ? `Confirm ${job.total} bales` : `Check ${job.total} bales`}
          </button>
        )}
        {progress && (
          <>
            <div className="progress">
              <div className="bar" style={{ width: pct + '%' }} />
            </div>
            <div className="stat-row">
              <span>
                {progress.done}/{progress.total}
              </span>
              <span className="green">✓ {progress.confirmed}</span>
              <span className="blue">• {progress.already} already</span>
              <span className="red">✕ {progress.errors}</span>
            </div>
          </>
        )}
      </div>

      <div className="chips">
        <Chip label="confirmed" n={counts.confirmed} c="green" />
        <Chip label="already" n={counts.already} c="blue" />
        <Chip label="pending" n={counts.pending} c="grey" />
        <Chip label="error" n={counts.error} c="red" />
      </div>

      {firstError && (
        <div className="err-text" style={{ marginBottom: 12 }}>
          <strong>Why confirms are failing:</strong> {firstError}
        </div>
      )}

      <div className="list">
        {job.bales.map((b) => (
          <div key={b.id} className="row">
            <div style={{ minWidth: 0 }}>
              <code className="ellipsis">{b.label || b.data.slice(0, 18) + '…'}</code>
              {b.status === 'error' && b.error && <div className="row-error">{b.error}</div>}
            </div>
            <span className={'badge ' + statusColor(b.status)}>{b.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Chip({ label, n, c }) {
  if (!n) return null;
  return (
    <span className={'chip ' + c}>
      {n} {label}
    </span>
  );
}

function statusColor(s) {
  if (s === 'confirmed' || s === 'already') return 'green';
  if (s === 'error') return 'red';
  if (s === 'checked') return 'blue';
  return 'grey';
}
