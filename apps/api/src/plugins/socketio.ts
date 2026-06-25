/**
 * Socket.IO plugin — bridges Redis pub/sub job progress events to connected clients.
 * Clients join a room per job_id after authenticating.
 */
import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import { FastifyInstance } from 'fastify';
import IORedis from 'ioredis';
import { JwtPayload } from '@skan-d/shared';

export default fp(async (app: FastifyInstance) => {
  const io = new Server(app.server, {
    cors: { origin: process.env.WEB_ORIGIN || 'http://localhost:5173', credentials: true },
    transports: ['websocket', 'polling'],
  });

  // Auth middleware — validate JWT from handshake auth
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = app.jwt.verify(token) as JwtPayload;
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket as any).user as JwtPayload;

    socket.on('subscribe:job', (jobId: string) => {
      // Only allow subscription to jobs belonging to the user's company (verified server-side)
      socket.join(`job:${jobId}:${user.companyId}`);
    });

    socket.on('unsubscribe:job', (jobId: string) => {
      socket.leave(`job:${jobId}:${user.companyId}`);
    });
  });

  // Subscribe to Redis pub/sub and fan out to Socket.IO rooms
  const subscriber = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  subscriber.psubscribe('job:*');
  subscriber.on('pmessage', (_pattern, channel, message) => {
    try {
      const data = JSON.parse(message);
      // channel = "job:<jobId>"
      const jobId = channel.split(':')[1];
      // Broadcast to all company rooms for this job
      // The room key includes companyId so only the owning company receives it
      io.to(`job:${jobId}:${data.companyId ?? ''}`).emit('job:progress', data);
    } catch {
      // ignore parse errors
    }
  });

  app.decorate('io', io);
});

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}
