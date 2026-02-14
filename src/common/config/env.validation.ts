import * as Joi from "joi";

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  SEAT_HOLD_TTL_SECONDS: Joi.number().default(120),
  SEAT_MAP_CACHE_TTL_MS: Joi.number().default(2000),
  EXCESS_FEE_PER_KG: Joi.number().default(10.0),
  MAX_BAGGAGE_WEIGHT_KG: Joi.number().default(25),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(2000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(50),
  PAYMENT_SERVICE_URL: Joi.string().uri().required(),
  WEIGHT_SERVICE_URL: Joi.string().uri().required(),
  NOTIFICATION_SERVICE_URL: Joi.string().uri().required(),
  PAYMENT_TIMEOUT_MS: Joi.number().default(5000),
  PAYMENT_MAX_RETRIES: Joi.number().default(3),
  PAYMENT_INITIAL_BACKOFF_MS: Joi.number().default(500),
  WEIGHT_SERVICE_TIMEOUT_MS: Joi.number().default(5000),
  SWEEP_INTERVAL_SECONDS: Joi.number().default(30),
  ABUSE_RETENTION_DAYS: Joi.number().default(90),
});
