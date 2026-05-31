import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── CORS ──────────────────────────────────────────────────────────────────
  // Allow the Angular dev servers (chat-web :4201, gallery-web :4202) to call
  // the API. In production, replace with the real frontend origin(s) or read
  // from an env variable.
  const allowedOrigins = (
    process.env['CORS_ORIGINS'] ??
    'http://localhost:4201,http://localhost:4202,http://localhost:4200'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  // ─────────────────────────────────────────────────────────────────────────

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ── Socket.IO Redis adapter ───────────────────────────────────────────────
  // Wire the adapter so room broadcasts work across multiple API instances.
  // We create two dedicated pub/sub clients from the same config shape used
  // by RedisModule — pub/sub clients must be separate connections.
  const redisHost = process.env['REDIS_HOST'] ?? 'localhost';
  const redisPort = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);
  const redisPassword = process.env['REDIS_PASSWORD'];
  const redisTls = process.env['REDIS_TLS'] === 'true';

  let pubClient: Redis;
  let subClient: Redis;

  if (redisTls && redisPassword) {
    const redisUrl = `rediss://default:${redisPassword}@${redisHost}:${redisPort}`;
    const tlsOpts = { tls: { rejectUnauthorized: false, servername: redisHost } };
    pubClient = new Redis(redisUrl, tlsOpts);
    subClient = new Redis(redisUrl, tlsOpts);
  } else {
    pubClient = new Redis({ host: redisHost, port: redisPort });
    subClient = pubClient.duplicate();
  }

  const redisAdapter = createAdapter(pubClient, subClient);

  // Extend the default IoAdapter to inject the Redis adapter.
  class RedisIoAdapter extends IoAdapter {
    createIOServer(port: number, options?: Record<string, unknown>) {
      const server = super.createIOServer(port, options);
      server.adapter(redisAdapter);
      return server;
    }
  }

  app.useWebSocketAdapter(new RedisIoAdapter(app));
  // ─────────────────────────────────────────────────────────────────────────

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
}

bootstrap();
