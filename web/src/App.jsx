import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import Devices from './components/Devices.jsx';
import Ingest from './components/Ingest.jsx';
import Scanner from './components/Scanner.jsx';
import Jobs from './components/Jobs.jsx';
import JobView from './components/JobView.jsx';

// Upload → auto-confirm is the primary flow; the camera scanner is a fallback.
const TABS = [
  { id: 'upload', label: 'Upload', icon: '📄' },
  { id: 'jobs', label: 'Jobs', icon: '📋' },
  { id: 'devices', label: 'Devices', icon: '🔑' },
  { id: 'scan', label: 'Scan', icon: '📷' },
];

export default function App() {
  const [cfg, setCfg] = useState(null);
  const [authed, setAuthed] = useState(true);
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState('upload');
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [openJob, setOpenJob] = useState(null);

  async function refreshDevices() {
    try {
      const d = await api.listDevices();
      setDevices(d);
      setDeviceId((cur) => cur || (d.find((x) => x.status === 'registered') || d[0])?.id || null);
    } catch (e) {
      if (e.status === 401) setAuthed(false);
    }
  }

  useEffect(() => {
    api.getConfig().then((c) => {
      setCfg(c);
      setAuthed(!c.authRequired);
    });
  }, []);

  useEffect(() => {
    if (authed) refreshDevices();
  }, [authed]);

  async function doLogin(e) {
    e.preventDefault();
    try {
      await api.login(password);
      setAuthed(true);
    } catch {
      alert('Wrong password');
    }
  }

  function openJobView(job) {
    setOpenJob(job.id);
    setTab('jobs');
  }

  if (cfg && cfg.authRequired && !authed) {
    return (
      <div className="login">
        <form onSubmit={doLogin} className="card">
          <h1>Bale Track Auto</h1>
          <input
            type="password"
            placeholder="App password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">Enter</button>
        </form>
      </div>
    );
  }

  const activeDevice = devices.find((d) => d.id === deviceId) || null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🧵</span>
          <div>
            <strong>Bale Track Auto</strong>
            <small>{cfg?.tcbBaseUrl?.replace(/^https?:\/\//, '')}</small>
          </div>
        </div>
        <DevicePicker devices={devices} deviceId={deviceId} setDeviceId={setDeviceId} />
      </header>

      <main className="content">
        {tab === 'scan' && <Scanner device={activeDevice} onOpenJob={openJobView} />}
        {tab === 'upload' && <Ingest onOpenJob={openJobView} />}
        {tab === 'jobs' &&
          (openJob ? (
            <JobView
              jobId={openJob}
              devices={devices}
              deviceId={deviceId}
              setDeviceId={setDeviceId}
              onBack={() => setOpenJob(null)}
            />
          ) : (
            <Jobs onOpen={(id) => setOpenJob(id)} />
          ))}
        {tab === 'devices' && <Devices devices={devices} onChange={refreshDevices} />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => {
              setTab(t.id);
              if (t.id === 'jobs') setOpenJob(null);
            }}
          >
            <span className="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function DevicePicker({ devices, deviceId, setDeviceId }) {
  if (!devices.length) return <span className="device-pill warn">No device</span>;
  const active = devices.find((d) => d.id === deviceId);
  return (
    <select
      className={'device-pill ' + (active?.status === 'registered' ? 'ok' : 'warn')}
      value={deviceId || ''}
      onChange={(e) => setDeviceId(e.target.value)}
    >
      {devices.map((d) => (
        <option key={d.id} value={d.id}>
          {d.status === 'registered' ? '● ' : '○ '}
          {d.label}
          {d.checkPointName ? ` (${d.checkPointName})` : ''}
        </option>
      ))}
    </select>
  );
}
