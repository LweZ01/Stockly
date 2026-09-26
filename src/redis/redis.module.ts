import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';

import { env } from '../config/env.js';
import { REDIS_CLIENT } from './redis.constants.js';
import { RedisThrottlerStorage } from '../common/rate-limit/redis-throttler-storage.js';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        return new Redis(env.redis.url, {
          maxRetriesPerRequest: 3,
        });
      },
    },
    RedisThrottlerStorage,
  ],
  exports: [REDIS_CLIENT, RedisThrottlerStorage],
})
export class RedisModule {}
