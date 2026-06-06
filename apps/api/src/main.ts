import { setDefaultAutoSelectFamily } from 'node:net';

setDefaultAutoSelectFamily(false);

process.on('unhandledRejection', (reason) => {
  console.error('--- UNHANDLED REJECTION ---');
  console.error(reason);
  if (reason && typeof reason === 'object' && 'errors' in reason) {
    console.error('--- AGGREGATE ERRORS ---');
    for (const inner of (reason as { errors: unknown[] }).errors) {
      console.error(inner);
    }
  }
});

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';

import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = (
    process.env['CORS_ORIGINS'] ??
    'http://localhost:4200,http://localhost:4201,http://localhost:4202'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const redisHost = process.env['REDIS_HOST'] ?? 'localhost';
  const redisPort = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);
  const redisPassword = process.env['REDIS_PASSWORD'];
  const redisTls = process.env['REDIS_TLS'] === 'true';

  let pubClient: Redis;
  let subClient: Redis;

  if (redisTls && redisPassword) {
    const redisUrl = `rediss://default:${redisPassword}@${redisHost}:${redisPort}`;
    const tlsOptions = {
      tls: { rejectUnauthorized: false, servername: redisHost },
    };

    pubClient = new Redis(redisUrl, tlsOptions);
    subClient = new Redis(redisUrl, tlsOptions);
  } else {
    pubClient = new Redis({ host: redisHost, port: redisPort });
    subClient = pubClient.duplicate();
  }

  const redisAdapter = createAdapter(pubClient, subClient);

  class RedisIoAdapter extends IoAdapter {
    override createIOServer(port: number, options?: Record<string, unknown>) {
      const server = super.createIOServer(port, options);
      server.adapter(redisAdapter);
      return server;
    }
  }

  app.useWebSocketAdapter(new RedisIoAdapter(app));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  Logger.log(`Application is running on: http://localhost:${port}/api/v1`);
}

void bootstrap();
