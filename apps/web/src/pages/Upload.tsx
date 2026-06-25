import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Upload as UploadIcon, FileText, Settings } from 'lucide-react';

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [confirmSelector, setConfirmSelector] = useState('button[type="submit"]');
  const [waitForNavigation, setWaitForNavigation] = useState(true);
  const [blockResources, setBlockResources] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError('');
    setUploading(true);

    const form = new FormData();
    form.append('pdf', file);
    form.append('confirmSelector', confirmSelector);
    form.append('waitForNavigation', String(waitForNavigation));
    form.append('blockResources', String(blockResources));

    try {
      const { data } = await api.post('/jobs', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      navigate(`/jobs/${data.jobId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold text-white mb-6">New Batch Job</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* PDF Drop Zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-indigo-400 bg-indigo-950/30' : 'border-slate-700 hover:border-slate-500 bg-slate-900'}`}
        >
          <input {...getInputProps()} />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="w-8 h-8 text-indigo-400" />
              <div className="text-left">
                <p className="text-white font-medium">{file.name}</p>
                <p className="text-slate-400 text-sm">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            </div>
          ) : (
            <div>
              <UploadIcon className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-300 font-medium">Drop your PDF here</p>
              <p className="text-slate-500 text-sm mt-1">or click to browse — one PDF with all QR codes</p>
            </div>
          )}
        </div>

        {/* Advanced Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-300 font-medium text-sm mb-2">
            <Settings className="w-4 h-4" /> Automation Settings
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Confirm Button Selector</label>
            <input
              value={confirmSelector}
              onChange={(e) => setConfirmSelector(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-slate-500 text-xs mt-1">CSS selector for the confirm button on each URL's page</p>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={waitForNavigation}
                onChange={(e) => setWaitForNavigation(e.target.checked)}
                className="rounded border-slate-600 text-indigo-500 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-300">Wait for navigation after click</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={blockResources}
                onChange={(e) => setBlockResources(e.target.checked)}
                className="rounded border-slate-600 text-indigo-500 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-300">Block images/fonts (faster)</span>
            </label>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg py-3 transition-colors"
        >
          {uploading ? 'Uploading...' : 'Start Batch Job'}
        </button>
      </form>
    </div>
  );
}
