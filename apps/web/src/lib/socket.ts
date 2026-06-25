import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth';
import { JobProgressEvent } from '@skan-d/shared';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      transports: ['websocket'],
      auth: { token: useAuthStore.getState().accessToken },
    });
  }
  return socket;
}

export function subscribeJob(
  jobId: string,
  onProgress: (data: JobProgressEvent) => void
): () => void {
  const s = getSocket();
  s.emit('subscribe:job', jobId);
  s.on('job:progress', onProgress);

  return () => {
    s.emit('unsubscribe:job', jobId);
    s.off('job:progress', onProgress);
  };
}
