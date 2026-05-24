import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // API
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_BASE_URL: Joi.string().uri().required(),

  // Database
  DB_HOST: Joi.string().hostname().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_DATABASE: Joi.string().required(),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').default(true),

  // Redis
  REDIS_HOST: Joi.string().hostname().required(),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_USERNAME: Joi.string().allow('').optional(),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_TLS: Joi.boolean().truthy('true').falsy('false').default(true),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.number().integer().positive().default(900),
  JWT_REFRESH_TTL: Joi.number().integer().positive().default(604800),

  // Encryption
  AES_ENCRYPTION_KEY: Joi.string()
    .base64()
    .required()
    .custom((value: string, helpers) => {
      const decoded = Buffer.from(value, 'base64');
      if (decoded.length !== 32) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .messages({
      'any.invalid':
        'AES_ENCRYPTION_KEY must be a base64-encoded 32-byte key. ' +
        'Generate one with: openssl rand -base64 32',
      'string.base64':
        'AES_ENCRYPTION_KEY must be a valid base64 string.',
    }),

  // Logging
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
});
