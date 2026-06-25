import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { subscribeJob } from '../lib/socket';
import { Job, UrlResult, JobProgressEvent, UrlStatus } from '@skan-d/shared';
import { Download, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

const statusColors: Record<UrlStatus, string> = {
  pending: 'text-slate-400',
  success: 'text-green-400',
  no_button: 'text-yellow-400',
  timeout: 'text-orange-400',
  error: 'text-red-400',
};

const statusIcons: Record<UrlStatus, React.ReactNode> = {
  pending: <Clock className="w-3.5 h-3.5" />,
  success: <CheckCircle className="w-3.5 h-3.5" />,
  no_button: <AlertCircle className="w-3.5 h-3.5" />,
  timeout: <Clock className="w-3.5 h-3.5" />,
  error: <XCircle className="w-3.5 h-3.5" />,
};

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [recentResults, setRecentResults] = useState<JobProgressEvent['recentResults']>([]);

  const { data: job } = useQuery<Job>({
    queryKey: ['job', id],
    queryFn: () => api.get(`/jobs/${id}`).then((r) => r.data),
    refetchInterval: (q) => (q.state.data?.status === 'completed' ? false : 3000),
  });

  const { data: resultsPage } = useQuery<{ results: UrlResult[]; total: number }>({
    queryKey: ['job-results', id],
    queryFn: () => api.get(`/jobs/${id}/results`).then((r) => r.data),
    enabled: !!job,
    refetchInterval: (q) => {
      const status = (q.state.data as any)?.status;
      return status === 'completed' ? false : 5000;
    },
  });

  useEffect(() => {
    if (!id) return;
    return subscribeJob(id, (data: JobProgressEvent) => {
      qc.setQueryData(['job', id], (old: Job | undefined) =>
        old ? { ...old, ...data } : old
      );
      if (data.recentResults?.length) {
        setRecentResults((prev) => [...data.recentResults, ...prev].slice(0, 50));
      }
    });
  }, [id]);

  if (!job) return <div className="p-8 text-slate-400">Loading...</div>;

  const done = job.success + job.failed + job.skipped;
  const pct = job.total > 0 ? Math.round((done / job.total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Job Detail</h1>
          <p className="text-slate-500 text-sm font-mono mt-0.5">{job.id}</p>
        </div>
        <a
          href={`/api/jobs/${id}/export.csv`}
          className="flex items-center gap-2 text-sm text-slate-300 hover:text-white border border-slate-700 rounded-lg px-3 py-2 transition-colors"
        >
          <Download className="w-4 h-4" /> Export CSV
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: job.total, color: 'text-white' },
          { label: 'Success', value: job.success, color: 'text-green-400' },
          { label: 'Failed', value: job.failed, color: 'text-red-400' },
          { label: 'Pending', value: Math.max(0, job.total - done), color: 'text-slate-400' },
        ].map((s) => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 text-xs uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-400 capitalize">{job.status}</span>
          <span className="text-white font-medium">{pct}%</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2">
          <div
            className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Live Results Feed */}
      {recentResults.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-slate-300 mb-3">Live Feed</h2>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {recentResults.map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-xs py-1">
                <span className={`flex items-center gap-1 ${statusColors[r.status as UrlStatus]}`}>
                  {statusIcons[r.status as UrlStatus]}
                  {r.status}
                </span>
                <span className="text-slate-400 truncate flex-1">{r.url}</span>
                {r.durationMs && <span className="text-slate-500 shrink-0">{r.durationMs}ms</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results Table */}
      {resultsPage && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h2 className="text-sm font-medium text-slate-300">
              Results ({resultsPage.total} total)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-2 text-slate-500 font-medium">URL</th>
                  <th className="text-left px-4 py-2 text-slate-500 font-medium">Status</th>
                  <th className="text-left px-4 py-2 text-slate-500 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {resultsPage.results.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-2 text-slate-300 truncate max-w-xs">{r.url}</td>
                    <td className={`px-4 py-2 font-medium ${statusColors[r.status]}`}>
                      <span className="flex items-center gap-1">
                        {statusIcons[r.status]} {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-400">
                      {r.durationMs ? `${r.durationMs}ms` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
