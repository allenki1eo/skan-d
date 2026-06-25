import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { JwtPayload, Role } from '@skan-d/shared';

export default fp(async (app: FastifyInstance) => {
  app.register(fastifyCookie);
  app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: '15m' },
  });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.decorate('requireRole', (roles: Role[]) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify();
        const payload = req.user as JwtPayload;
        if (!roles.includes(payload.role)) {
          reply.code(403).send({ error: 'Forbidden' });
        }
      } catch {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    };
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: Role[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
