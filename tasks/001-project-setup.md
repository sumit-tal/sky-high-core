# 001 - Project Setup & Configuration

## Description

Initialize the NestJS project with TypeScript, configure the foundational tooling, and set up the development environment.

## Tasks

- [x] Initialize NestJS project with TypeScript (`nest new`)
- [x] Configure `tsconfig.json` with strict mode
- [x] Set up `package.json` with required dependencies:
  - NestJS core, platform-express
  - TypeORM + pg driver
  - ioredis / redis
  - @nestjs/config (environment management)
  - class-validator, class-transformer (DTO validation)
  - Pino logger (nestjs-pino)
  - Prometheus client (prom-client, @willsoto/nestjs-prometheus)
  - OpenTelemetry SDK + auto-instrumentations
  - jsonwebtoken / @nestjs/jwt
  - redlock
  - uuid
- [x] Create `.env.example` with all environment variables from Technical PRD §11.3
- [x] Configure `ConfigModule` (global, validated with Joi or class-validator)
- [x] Set up global validation pipe (`ValidationPipe` with whitelist & transform)
- [x] Create `app.module.ts` root module with global imports
- [x] Set up API versioning prefix `/api/v1`
- [x] Create `README.md` with setup instructions

## Acceptance Criteria

- `npm run start:dev` boots without errors
- Environment variables are loaded and validated
- API prefix `/api/v1` is active
- Project structure matches Technical PRD §4
