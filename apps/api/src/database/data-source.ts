/**
 * CLI-only DataSource — used by `typeorm` / `migration:*` commands.
 *
 * Reads environment variables directly; no Nest DI involved.
 * Must export exactly one default DataSource and nothing else.
 */
import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';

import { ALL_ENTITIES } from './typeorm.config';

const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env['DB_HOST'],
  port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
  username: process.env['DB_USERNAME'],
  password: process.env['DB_PASSWORD'],
  database: process.env['DB_DATABASE'],
  ssl:
    process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  entities: [...ALL_ENTITIES],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: ['error', 'warn'],
};

export default new DataSource(dataSourceOptions);