import IORedis from 'ioredis';

let _redis: IORedis | null = null;

export function getRedis(): IORedis {
  if (!_redis) {
    _redis = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
    });
  }
  return _redis;
}
