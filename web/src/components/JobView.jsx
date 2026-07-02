import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function JobView({ jobId, devices, deviceId, setDeviceId, onBack }) {
  const [job, setJob] = useState(null);
  const [progress, setProgress] = useState(null);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState('confirm');
  const esRef = useRef(null);

  async function refresh() {
    try {
      setJob(await api.getJob(jobId));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refresh();
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    esRef.current = es;
    es.onmessage = (ev) => {
      const p = JSON.parse(ev.data);
      if (p.type === 'start') {
        setRunning(true);
        setProgress({ done: 0, total: p.total, confirmed: 0, already: 0, errors: 0 });
      } else if (p.type === 'progress') {
        setProgress(p);
      } else if (p.type === 'bale') {
        setJob((j) =>
          j ? { ...j, bales: j.bales.map((b) => (b.id === p.id ? { ...b, status: p.status } : b)) } : j,
        );
      } else if (p.type === 'done') {
        setProgress(p);
        setRunning(false);
        refresh();
      } else if (p.type === 'error') {
        setRunning(false);
      }
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function run() {
    if (!deviceId) {
      alert('Select a device first (Devices tab).');
      return;
    }
    setRunning(true);
    try {
      await api.runJob(jobId, deviceId, mode);
    } catch (err) {
      alert(err.message);
      setRunning(false);
    }
  }

  if (!job) return <div className="page">Loading…</div>;

  const counts = job.bales.reduce((a, b) => ((a[b.status] = (a[b.status] || 0) + 1), a), {});
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

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
        <button className="big" disabled={running} onClick={run}>
          {running ? 'Running…' : mode === 'confirm' ? `Confirm ${job.total} bales` : `Check ${job.total} bales`}
        </button>
        {progress && (
          <>
            <div className="progress">
              <div className="bar" style={{ width: pct + '%' }} />
            </div>
            <div className="stat-row">
              <span>{progress.done}/{progress.total}</span>
              <span className="green">✓ {progress.confirmed || 0}</span>
              <span className="blue">• {progress.already || 0} already</span>
              <span className="red">✕ {progress.errors || 0}</span>
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

      <div className="list">
        {job.bales.map((b) => (
          <div key={b.id} className="row">
            <code className="ellipsis">{b.label || b.data.slice(0, 18) + '…'}</code>
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
