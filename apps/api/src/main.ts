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

/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Enable class-validator / class-transformer on all endpoints globally.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strip unknown properties
      forbidNonWhitelisted: true,
      transform: true,       // auto-cast payload types
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
