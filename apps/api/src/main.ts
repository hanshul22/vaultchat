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

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: 'http://localhost:4200', credentials: true });
  app.use(cookieParser());
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
