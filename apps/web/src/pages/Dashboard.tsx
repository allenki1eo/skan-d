import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Job, JobStatus } from '@skan-d/shared';
import { Plus, ChevronRight } from 'lucide-react';

const statusBadge: Record<JobStatus, string> = {
  pending: 'bg-slate-700 text-slate-300',
  decoding: 'bg-blue-900 text-blue-300',
  running: 'bg-indigo-900 text-indigo-300',
  completed: 'bg-green-900 text-green-300',
  failed: 'bg-red-900 text-red-300',
};

export default function Dashboard() {
  const { data: jobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ['jobs'],
    queryFn: () => api.get('/jobs').then((r) => r.data),
    refetchInterval: 5000,
  });

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Batch Jobs</h1>
        <Link
          to="/upload"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Batch
        </Link>
      </div>

      {isLoading && <p className="text-slate-400">Loading...</p>}

      <div className="space-y-2">
        {jobs.map((job) => {
          const done = job.success + job.failed + job.skipped;
          const pct = job.total > 0 ? Math.round((done / job.total) * 100) : 0;
          return (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="flex items-center gap-4 bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 hover:border-slate-600 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge[job.status]}`}>
                    {job.status}
                  </span>
                  <span className="text-slate-500 text-xs font-mono truncate">{job.id}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-400">
                  <span>{job.total} URLs</span>
                  <span className="text-green-400">{job.success} ok</span>
                  <span className="text-red-400">{job.failed} failed</span>
                </div>
                {job.status === 'running' && (
                  <div className="mt-2 w-full bg-slate-800 rounded-full h-1">
                    <div
                      className="bg-indigo-500 h-1 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="text-slate-600 group-hover:text-slate-400 transition-colors">
                <ChevronRight className="w-5 h-5" />
              </div>
            </Link>
          );
        })}
        {!isLoading && jobs.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <p>No batch jobs yet.</p>
            <Link to="/upload" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
              Upload your first PDF
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
