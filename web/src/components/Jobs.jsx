import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Jobs({ onOpen }) {
  const [jobs, setJobs] = useState([]);

  async function refresh() {
    setJobs(await api.listJobs());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function remove(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this job?')) return;
    await api.deleteJob(id);
    refresh();
  }

  return (
    <div className="page">
      <h2>Jobs</h2>
      <div className="list">
        {jobs.map((j) => (
          <div key={j.id} className="row clickable" onClick={() => onOpen(j.id)}>
            <div>
              <strong>{j.name}</strong>
              <div className="sub">
                <span className="badge grey">{j.source}</span>
                <span className="badge blue">{j.total} bales</span>
                <span className={'badge ' + (j.status === 'done' ? 'green' : 'grey')}>{j.status}</span>
              </div>
            </div>
            <button className="link danger" onClick={(e) => remove(e, j.id)}>
              Delete
            </button>
          </div>
        ))}
        {!jobs.length && (
          <div className="empty">
            <span className="empty-icon">📋</span>
            <p>No jobs yet.</p>
            <p className="muted">Upload a QR sheet to create your first job.</p>
          </div>
        )}
      </div>
    </div>
  );
}
