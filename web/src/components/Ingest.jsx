import React, { useState } from 'react';
import { api } from '../api.js';
import { decodeFiles } from '../decode.js';

// Never let a stuck decode/save hang the UI forever — fail loudly after this.
const STEP_TIMEOUT_MS = 90000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out — please try again`)), ms)),
  ]);
}

export default function Ingest({ onOpenJob }) {
  const [phase, setPhase] = useState(null); // 'decode' | 'save' | null
  const [msg, setMsg] = useState(null);
  const [paste, setPaste] = useState('');
  const busy = phase !== null;

  async function upload(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    setMsg(null);
    setPhase('decode');
    try {
      // Decode in the browser (works on serverless), then create the job from URLs.
      const urls = await withTimeout(decodeFiles(files), STEP_TIMEOUT_MS, 'Decoding');
      if (!urls.length) {
        setMsg({ ok: false, text: 'No QR codes found in that file. Try a clearer scan or a higher-quality PDF.' });
        return;
      }
      setPhase('save');
      const name = files.length === 1 ? files[0].name : `${files.length} files`;
      const source = /\.pdf$/i.test(files[0].name) ? 'pdf' : 'image';
      const job = await withTimeout(api.createJob(urls, name, source), STEP_TIMEOUT_MS, 'Saving');
      setMsg({ ok: true, text: `Decoded ${urls.length} QR code(s), added ${job.added} bale(s).` });
      onOpenJob(job);
    } catch (err) {
      setMsg({ ok: false, text: err.message || 'Upload failed' });
    } finally {
      setPhase(null);
    }
  }

  async function submitPaste(e) {
    e.preventDefault();
    const urls = paste
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!urls.length) return;
    setMsg(null);
    setPhase('save');
    try {
      const job = await withTimeout(api.createJob(urls, 'Pasted URLs', 'paste'), STEP_TIMEOUT_MS, 'Saving');
      onOpenJob(job);
    } catch (err) {
      setMsg({ ok: false, text: err.message || 'Failed to create job' });
    } finally {
      setPhase(null);
    }
  }

  const dzLabel = phase === 'decode' ? 'Decoding…' : phase === 'save' ? 'Saving…' : 'Tap to choose PDF / images';

  return (
    <div className="page">
      <h2>Upload QR sheet</h2>
      <p className="muted">
        Upload the TCB QR-code PDF (or a photo of the sheet). Every bale is decoded automatically, then
        you confirm them all in one go.
      </p>

      <label className="dropzone">
        <input
          type="file"
          accept="application/pdf,image/*"
          multiple
          disabled={busy}
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = ''; // allow re-selecting the same file
          }}
        />
        <div className="dz-inner">
          <span className="dz-icon">{busy ? '⏳' : '⬆️'}</span>
          <span>{dzLabel}</span>
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
