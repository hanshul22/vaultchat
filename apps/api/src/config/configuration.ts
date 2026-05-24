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
  
  export interface EncryptionConfig {
    key: string;
  }

  export interface JwtConfig {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
  }

  export interface RootConfig {
    app: AppConfig;
    database: DatabaseConfig;
    redis: RedisConfig;
    encryption: EncryptionConfig;
    jwt: JwtConfig;
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
    encryption: {
      key: process.env['AES_ENCRYPTION_KEY'] as string,
    },
    jwt: {
      accessSecret: process.env['JWT_ACCESS_SECRET'] as string,
      refreshSecret: process.env['JWT_REFRESH_SECRET'] as string,
      accessTtl: parseInt(process.env['JWT_ACCESS_TTL'] as string, 10),
      refreshTtl: parseInt(process.env['JWT_REFRESH_TTL'] as string, 10),
    },
    logLevel: process.env['LOG_LEVEL'] as string,
  });