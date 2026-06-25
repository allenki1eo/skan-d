import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Company, CreateCompanyBody } from '@skan-d/shared';
import { Plus, Building2 } from 'lucide-react';

export default function AdminPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateCompanyBody>({
    name: '',
    slug: '',
    quotaBatchSize: 1000,
    quotaConcurrency: 20,
    quotaMonthlyUrls: 50000,
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies').then((r) => r.data),
  });

  const createCompany = useMutation({
    mutationFn: (body: CreateCompanyBody) => api.post('/companies', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      setShowForm(false);
      setForm({ name: '', slug: '', quotaBatchSize: 1000, quotaConcurrency: 20, quotaMonthlyUrls: 50000 });
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/companies/${id}`, { active }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  });

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Super Admin</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage companies and their access</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Company
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
          <h2 className="text-white font-medium mb-4">Create Company</h2>
          <form
            onSubmit={(e) => { e.preventDefault(); createCompany.mutate(form); }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Company Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Slug (unique)</label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  pattern="^[a-z0-9-]+"
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Batch Size Quota', key: 'quotaBatchSize' as const },
                { label: 'Concurrency Quota', key: 'quotaConcurrency' as const },
                { label: 'Monthly URLs Quota', key: 'quotaMonthlyUrls' as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-sm text-slate-400 mb-1">{label}</label>
                  <input
                    type="number"
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createCompany.isPending}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {createCompany.isPending ? 'Creating...' : 'Create Company'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-white text-sm px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {companies.map((c) => (
          <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <h3 className="text-white font-medium">{c.name}</h3>
                  <span className="text-xs text-slate-500 font-mono">{c.slug}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.active ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                    {c.active ? 'Active' : 'Suspended'}
                  </span>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-slate-500">
                  <span>Batch: {c.quotaBatchSize}</span>
                  <span>Concurrency: {c.quotaConcurrency}</span>
                  <span>Monthly URLs: {c.quotaMonthlyUrls.toLocaleString()}</span>
                </div>
              </div>
              <button
                onClick={() => toggleActive.mutate({ id: c.id, active: !c.active })}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  c.active
                    ? 'border-red-800 text-red-400 hover:bg-red-900/30'
                    : 'border-green-800 text-green-400 hover:bg-green-900/30'
                }`}
              >
                {c.active ? 'Suspend' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
