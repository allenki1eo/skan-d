import React, { useState } from 'react';
import { api } from '../api.js';

export default function Devices({ devices, onChange }) {
  const [mode, setMode] = useState('register');
  const [link, setLink] = useState('');
  const [cookies, setCookies] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'register') {
        await api.registerDevice(link.trim(), label.trim());
        setLink('');
      } else {
        await api.importDevice(cookies.trim(), label.trim());
        setCookies('');
      }
      setLabel('');
      setMsg({ ok: true, text: 'Device added.' });
      onChange();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function verify(d) {
    const sample = prompt('Paste any bale QR link/URL to verify this device is authorized:');
    if (!sample) return;
    try {
      const r = await api.verifyDevice(d.id, sample.trim());
      alert(r.authorized ? `✅ Authorized (${r.checkPoint === 2 ? 'Port' : 'Ginnery'})` : `❌ Not authorized (HTTP ${r.httpStatus})`);
      onChange();
    } catch (err) {
      alert(err.message);
    }
  }

  async function remove(d) {
    if (!confirm(`Remove device "${d.label}"?`)) return;
    await api.deleteDevice(d.id);
    onChange();
  }

  return (
    <div className="page">
      <h2>Devices</h2>
      <p className="muted">
        A device is a registered TCB session. Auto-confirm uses its cookies to act as an authorized scanner.
      </p>

      <div className="segmented">
        <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>
          Register link
        </button>
        <button className={mode === 'import' ? 'on' : ''} onClick={() => setMode('import')}>
          Import cookies
        </button>
      </div>

      <form onSubmit={submit} className="card">
        {mode === 'register' ? (
          <>
            <label>Registration link from TCB</label>
            <input
              placeholder="https://ccis.tcb.go.tz/baletrack/register/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              required
            />
            <p className="hint">The service opens this link and registers itself as the scanning device.</p>
          </>
        ) : (
          <>
            <label>Cookies from an already-registered phone</label>
            <textarea
              placeholder="JSESSIONID=…; XSRF-TOKEN=…"
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
              rows={3}
              required
            />
            <p className="hint">
              On the registered phone open the site, then in the browser console run{' '}
              <code>document.cookie</code> and paste the result here.
            </p>
          </>
        )}
        <label>Label (optional)</label>
        <input placeholder="e.g. Ginnery scanner" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'register' ? 'Register device' : 'Import device'}
        </button>
        {msg && <p className={msg.ok ? 'ok-text' : 'err-text'}>{msg.text}</p>}
      </form>

      <div className="list">
        {devices.map((d) => (
          <div key={d.id} className="row">
            <div>
              <strong>{d.label}</strong>
              <div className="sub">
                <span className={'badge ' + (d.status === 'registered' ? 'green' : d.status === 'invalid' ? 'red' : 'grey')}>
                  {d.status}
                </span>
                {d.checkPointName && <span className="badge blue">{d.checkPointName}</span>}
                {d.user && <span className="muted"> {d.user}</span>}
              </div>
            </div>
            <div className="actions">
              <button className="link" onClick={() => verify(d)}>
                Verify
              </button>
              <button className="link danger" onClick={() => remove(d)}>
                Remove
              </button>
            </div>
          </div>
        ))}
        {!devices.length && <p className="muted">No devices yet. Add one above.</p>}
      </div>
    </div>
  );
}
