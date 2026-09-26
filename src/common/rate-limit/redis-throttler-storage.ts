import { Injectable, Inject } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../redis/redis.constants.js';

type RedisClient = InstanceType<typeof Redis>;

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

const INCREMENT_SCRIPT = `
  local totalHits = redis.call("INCR", KEYS[1])
  if totalHits == 1 then
    redis.call("PEXPIRE", KEYS[1], ARGV[1])
  end
  local ttl = redis.call("PTTL", KEYS[1])
  return { totalHits, ttl }
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: RedisClient,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;

    const [totalHits, ttlMs] = (await this.redis.eval(
      INCREMENT_SCRIPT,
      1,
      redisKey,
      ttl,
    )) as [number, number];

    return {
      totalHits,
      timeToExpire: Math.ceil(ttlMs / 1000),
      isBlocked: totalHits > limit,
      timeToBlockExpire: 0,
    };
  }
}
