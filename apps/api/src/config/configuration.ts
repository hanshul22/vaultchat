export interface AppConfig {
    nodeEnv: 'development' | 'test' | 'staging' | 'production';
    port: number;
    apiBaseUrl: string;
  }
  
  export interface DatabaseConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl: boolean;
  }
  
  export interface RedisConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    tls: boolean;
  }
  
  export interface RootConfig {
    app: AppConfig;
    database: DatabaseConfig;
    redis: RedisConfig;
    logLevel: string;
  }
  
  export const configuration = (): RootConfig => ({
    app: {
      nodeEnv: process.env['NODE_ENV'] as AppConfig['nodeEnv'],
      port: parseInt(process.env['PORT'] as string, 10),
      apiBaseUrl: process.env['API_BASE_URL'] as string,
    },
    database: {
      host: process.env['DB_HOST'] as string,
      port: parseInt(process.env['DB_PORT'] as string, 10),
      username: process.env['DB_USERNAME'] as string,
      password: process.env['DB_PASSWORD'] as string,
      database: process.env['DB_DATABASE'] as string,
      ssl: process.env['DB_SSL'] === 'true',
    },
    redis: {
      host: process.env['REDIS_HOST'] as string,
      port: parseInt(process.env['REDIS_PORT'] as string, 10),
      username: process.env['REDIS_USERNAME'] as string,
      password: process.env['REDIS_PASSWORD'] as string,
      tls: process.env['REDIS_TLS'] === 'true',
    },
    logLevel: process.env['LOG_LEVEL'] as string,
  });