import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api } from '../api.js';

const isBale = (s) => /baletrack\/[0-9a-fA-F]{16,}/.test(s);

export default function Scanner({ device, onOpenJob }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const seenRef = useRef(new Set());
  const jobRef = useRef(null);

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [auto, setAuto] = useState(true);
  const [scanned, setScanned] = useState([]); // {url, status}
  const [last, setLast] = useState(null);

  useEffect(() => () => stop(), []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);
      tick();
    } catch (err) {
      setError('Camera unavailable: ' + err.message);
    }
  }

  function stop() {
    cancelAnimationFrame(rafRef.current);
    const v = videoRef.current;
    if (v && v.srcObject) {
      v.srcObject.getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    }
    setScanning(false);
  }

  function tick() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) onDetect(code.data);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  async function onDetect(text) {
    if (!isBale(text) || seenRef.current.has(text)) return;
    seenRef.current.add(text);
    if (navigator.vibrate) navigator.vibrate(60);
    setLast(text);

    const entry = { url: text, status: 'added' };
    setScanned((s) => [entry, ...s]);

    try {
      if (!jobRef.current) {
        const job = await api.createJob([text], `Scan ${new Date().toLocaleString()}`, 'scan');
        jobRef.current = job.id;
      } else {
        await api.addBales(jobRef.current, [text]);
      }
      if (auto && device) {
        updateStatus(text, 'confirming');
        const data = text.split('/').pop();
        const r = await api.confirmBale({ deviceId: device.id, data, mode: 'confirm', jobId: jobRef.current });
        updateStatus(text, r.status);
      }
    } catch (err) {
      updateStatus(text, 'error');
    }
  }

  function updateStatus(url, status) {
    setScanned((s) => s.map((e) => (e.url === url ? { ...e, status } : e)));
  }

  return (
    <div className="page scanner">
      <h2>Live scan</h2>
      {!device && <p className="err-text">No registered device selected — scans will be saved but not confirmed.</p>}

      <div className="viewport">
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} hidden />
        {!scanning && (
          <div className="viewport-overlay">
            <button className="big" onClick={start}>
              ▶ Start camera
            </button>
          </div>
        )}
        {scanning && <div className="reticle" />}
      </div>

      {error && <p className="err-text">{error}</p>}

      <div className="scan-controls">
        <label className="toggle">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Auto-confirm on scan
        </label>
        {scanning ? (
          <button className="link danger" onClick={stop}>
            Stop
          </button>
        ) : (
          jobRef.current && (
            <button className="link" onClick={() => onOpenJob({ id: jobRef.current })}>
              Open session ({scanned.length})
            </button>
          )
        )}
      </div>

      <div className="list">
        {scanned.map((e) => (
          <div key={e.url} className="row">
            <code className="ellipsis">{e.url.split('/').pop().slice(0, 20)}…</code>
            <span className={'badge ' + statusColor(e.status)}>{e.status}</span>
          </div>
        ))}
        {!scanned.length && scanning && <p className="muted">Point the camera at a bale QR code…</p>}
      </div>
    </div>
  );
}

function statusColor(s) {
  if (s === 'confirmed' || s === 'already') return 'green';
  if (s === 'error') return 'red';
  if (s === 'confirming') return 'blue';
  return 'grey';
}
