import IORedis from 'ioredis';

let _redis: IORedis | null = null;

/**
 * Returns a shared ioredis client.
 * REDIS_URL supports both plain redis:// and rediss:// (TLS for Upstash).
 */
export function getRedis(): IORedis {
  if (!_redis) {
    _redis = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
    });
  }
  return _redis;
}
