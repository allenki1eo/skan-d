import React, { useState } from 'react';
import { api } from '../api.js';
import { decodeFiles } from '../decode.js';

export default function Ingest({ onOpenJob }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [paste, setPaste] = useState('');

  async function upload(files) {
    if (!files.length) return;
    setBusy(true);
    setMsg(null);
    try {
      // Decode in the browser (works on serverless), then create the job from URLs.
      const urls = await decodeFiles(files);
      if (!urls.length) {
        setMsg({ ok: false, text: 'No QR codes found in that file.' });
        return;
      }
      const name = files.length === 1 ? files[0].name : `${files.length} files`;
      const source = /\.pdf$/i.test(files[0].name) ? 'pdf' : 'image';
      const job = await api.createJob(urls, name, source);
      setMsg({ ok: true, text: `Decoded ${urls.length} QR code(s), added ${job.added} bale(s).` });
      onOpenJob(job);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function submitPaste(e) {
    e.preventDefault();
    const urls = paste
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!urls.length) return;
    setBusy(true);
    try {
      const job = await api.createJob(urls, 'Pasted URLs', 'paste');
      onOpenJob(job);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h2>Upload QR sheet</h2>
      <p className="muted">Upload the TCB QR-code PDF or a photo of the sheet. Every bale is decoded automatically.</p>

      <label className="dropzone">
        <input
          type="file"
          accept="application/pdf,image/*"
          multiple
          disabled={busy}
          onChange={(e) => upload([...e.target.files])}
        />
        <div className="dz-inner">
          <span className="dz-icon">⬆️</span>
          <span>{busy ? 'Decoding…' : 'Tap to choose PDF / images'}</span>
        </div>
      </label>

      {msg && <p className={msg.ok ? 'ok-text' : 'err-text'}>{msg.text}</p>}

      <details className="card">
        <summary>Or paste bale URLs</summary>
        <form onSubmit={submitPaste}>
          <textarea
            rows={4}
            placeholder="https://ccis.tcb.go.tz/baletrack/… (one per line)"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            Create job
          </button>
        </form>
      </details>
    </div>
  );
}
