import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DatabaseConfig } from '../config/configuration';

export const buildTypeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const db = configService.get<DatabaseConfig>('database');

  if (!db) {
    throw new Error('Database configuration is missing');
  }

  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.username,
    password: db.password,
    database: db.database,
    ssl: db.ssl ? { rejectUnauthorized: false } : false,

    // Entity discovery — we'll create the `entities` folder in Step 7.
    // The glob picks up every `*.entity.ts` (dev) or `*.entity.js` (prod build).
    entities: [__dirname + '/../**/*.entity.{ts,js}'],

    // Migrations — we'll create real ones in Step 8.
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    migrationsTableName: 'typeorm_migrations',

    // Never auto-sync schema. Always use migrations.
    synchronize: false,

    // Log only errors by default. Bump to ['query', 'error'] when debugging.
    logging: ['error', 'warn'],

    // Auto-load entities registered via `TypeOrmModule.forFeature([...])`.
    autoLoadEntities: true,
  };
};