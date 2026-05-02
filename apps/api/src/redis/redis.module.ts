import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('redis.host');
        const port = config.get<number>('redis.port');
        const password = config.get<string>('redis.password');
        const tls = config.get<boolean>('redis.tls');

        if (tls && password) {
          const redisUrl = `rediss://default:${password}@${host}:${port}`;
          return new Redis(redisUrl, {
            tls: { rejectUnauthorized: false, servername: host },
            maxRetriesPerRequest: 3,
          });
        }

        return new Redis({ host, port, maxRetriesPerRequest: 3 });
      },
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}