import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';

import { env } from '../config/env.js';
import { REDIS_CLIENT } from './redis.constants.js';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        return new Redis(env.redis.url, {
          // Evita que la app se cuelgue esperando a Redis al bootear si
          // aún no está listo; los comandos se encolan y reintentan.
          maxRetriesPerRequest: 3,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
