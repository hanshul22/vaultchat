import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    let db = 'error';
    let redisStatus = 'error';

    try {
      await this.dataSource.query('SELECT 1');
      db = 'ok';
    } catch {
      // connection failed — db stays 'error'
    }

    try {
      await this.redis.ping();
      redisStatus = 'ok';
    } catch {
      // connection failed — redis stays 'error'
    }

    return {
      status: db === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded',
      db,
      redis: redisStatus,
      env: process.env.NODE_ENV,
    };
  }
}
