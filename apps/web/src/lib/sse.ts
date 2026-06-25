import { JobProgressEvent } from '@skan-d/shared';
import { useAuthStore } from '../store/auth';

/**
 * Subscribe to SSE job progress stream.
 * Returns an unsubscribe function.
 */
export function subscribeJob(
  jobId: string,
  onProgress: (data: JobProgressEvent) => void
): () => void {
  const token = useAuthStore.getState().accessToken;
  // Pass JWT as query param — EventSource doesn't support custom headers
  const url = `/api/jobs/${jobId}/stream?token=${encodeURIComponent(token ?? '')}`;
  const es = new EventSource(url);

  es.onmessage = (e) => {
    try {
      onProgress(JSON.parse(e.data));
    } catch {
      // ignore malformed frames
    }
  };

  return () => es.close();
}
