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
import cookieParser from 'cookie-parser';

import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: [
        'http://localhost:4200',
        'http://localhost:4201',
        'http://localhost:4202',
      ],
      credentials: true,
    },
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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  Logger.log(`🚀 Application is running on: http://localhost:${port}/api/v1`);
}

void bootstrap();