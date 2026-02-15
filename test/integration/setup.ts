import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
import { DataSource } from "typeorm";
import * as request from "supertest";
import { App } from "supertest/types";
import { ConfigModule } from "@nestjs/config";
import { AppModule } from "../../src/app.module";
import { HttpExceptionFilter } from "../../src/common/filters/http-exception.filter";
import { generateTestJwt } from "../../src/common/utils/generate-test-jwt";
import { envValidationSchema } from "../../src/common/config/env.validation";

const POSTGRES_IMAGE = "postgres:16-alpine";
const REDIS_IMAGE = "redis:7-alpine";
const POSTGRES_DB = "skyhigh_test";
const POSTGRES_USER = "skyhigh";
const POSTGRES_PASSWORD = "skyhigh";
const JWT_SECRET = "test-jwt-secret";

interface TestContext {
  readonly app: INestApplication<App>;
  readonly module: TestingModule;
  readonly dataSource: DataSource;
  readonly postgresContainer: StartedTestContainer;
  readonly redisContainer: StartedTestContainer;
  readonly paymentServer: ReturnType<typeof import("http").createServer>;
  readonly weightServer: ReturnType<typeof import("http").createServer>;
  readonly notificationServer: ReturnType<typeof import("http").createServer>;
}

let paymentPort: number;
let weightPort: number;
let notificationPort: number;

/**
 * Creates stub HTTP servers for external services (payment, weight, notification).
 * Returns the servers and their dynamically assigned ports.
 */
const createStubServers = async (): Promise<{
  paymentServer: ReturnType<typeof import("http").createServer>;
  weightServer: ReturnType<typeof import("http").createServer>;
  notificationServer: ReturnType<typeof import("http").createServer>;
  paymentPort: number;
  weightPort: number;
  notificationPort: number;
}> => {
  const http = await import("http");
  const paymentServer = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/v1/payments") {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        const parsed = JSON.parse(body) as {
          passengerId: string;
          amount: number;
          currency: string;
        };
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            transactionId: `txn_${Date.now()}`,
            passengerId: parsed.passengerId,
            amount: parsed.amount,
            currency: parsed.currency || "USD",
            status: "confirmed",
            timestamp: new Date().toISOString(),
          }),
        );
      });
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  });
  const weightServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        passengerId: "unknown",
        weight: 20,
        unit: "kg",
        timestamp: new Date().toISOString(),
      }),
    );
  });
  const notificationServer = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/v1/notifications") {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        const parsed = JSON.parse(body) as {
          type: string;
          passengerId: string;
        };
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            notificationId: `notif_${Date.now()}`,
            type: parsed.type,
            passengerId: parsed.passengerId,
            status: "accepted",
            timestamp: new Date().toISOString(),
          }),
        );
      });
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  });
  await new Promise<void>((resolve) => paymentServer.listen(0, resolve));
  await new Promise<void>((resolve) => weightServer.listen(0, resolve));
  await new Promise<void>((resolve) => notificationServer.listen(0, resolve));
  const pPort = (paymentServer.address() as { port: number }).port;
  const wPort = (weightServer.address() as { port: number }).port;
  const nPort = (notificationServer.address() as { port: number }).port;
  return {
    paymentServer,
    weightServer,
    notificationServer,
    paymentPort: pPort,
    weightPort: wPort,
    notificationPort: nPort,
  };
};

/**
 * Bootstraps the full integration test environment:
 * 1. Start PostgreSQL and Redis Testcontainers
 * 2. Start stub HTTP servers for payment, weight, notification
 * 3. Create NestJS app with real DB and Redis connections
 * 4. Run migrations and seed data
 */
export const setupIntegrationTest = async (): Promise<TestContext> => {
  const [postgresContainer, redisContainer] = await Promise.all([
    new GenericContainer(POSTGRES_IMAGE)
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_DB,
        POSTGRES_USER,
        POSTGRES_PASSWORD,
      })
      .withWaitStrategy(
        Wait.forLogMessage("database system is ready to accept connections", 2),
      )
      .start(),
    new GenericContainer(REDIS_IMAGE)
      .withExposedPorts(6379)
      .withCommand(["redis-server", "--notify-keyspace-events", "Ex"])
      .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
      .start(),
  ]);
  const pgHost = postgresContainer.getHost();
  const pgPort = postgresContainer.getMappedPort(5432);
  const redisHost = redisContainer.getHost();
  const redisPort = redisContainer.getMappedPort(6379);
  const databaseUrl = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${pgHost}:${pgPort}/${POSTGRES_DB}`;
  const redisUrl = `redis://${redisHost}:${redisPort}`;
  const stubs = await createStubServers();
  paymentPort = stubs.paymentPort;
  weightPort = stubs.weightPort;
  notificationPort = stubs.notificationPort;
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.PAYMENT_SERVICE_URL = `http://127.0.0.1:${paymentPort}`;
  process.env.WEIGHT_SERVICE_URL = `http://127.0.0.1:${weightPort}`;
  process.env.NOTIFICATION_SERVICE_URL = `http://127.0.0.1:${notificationPort}`;
  process.env.SEAT_HOLD_TTL_SECONDS = "120";
  process.env.SEAT_MAP_CACHE_TTL_MS = "2000";
  process.env.EXCESS_FEE_PER_KG = "10";
  process.env.MAX_BAGGAGE_WEIGHT_KG = "25";
  process.env.RATE_LIMIT_WINDOW_MS = "2000";
  process.env.RATE_LIMIT_MAX_REQUESTS = "50";
  process.env.PAYMENT_TIMEOUT_MS = "5000";
  process.env.PAYMENT_MAX_RETRIES = "3";
  process.env.PAYMENT_INITIAL_BACKOFF_MS = "500";
  process.env.WEIGHT_SERVICE_TIMEOUT_MS = "5000";
  process.env.NOTIFICATION_TIMEOUT_MS = "5000";
  process.env.SWEEP_INTERVAL_SECONDS = "30";
  process.env.ABUSE_RETENTION_DAYS = "90";
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideModule(ConfigModule)
    .useModule(
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        validationSchema: envValidationSchema,
        validationOptions: { abortEarly: false },
      }),
    )
    .compile();
  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "metrics", method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  const dataSource = moduleFixture.get(DataSource);
  await dataSource.runMigrations();
  await seedTestData(dataSource);
  return {
    app,
    module: moduleFixture,
    dataSource,
    postgresContainer,
    redisContainer,
    paymentServer: stubs.paymentServer,
    weightServer: stubs.weightServer,
    notificationServer: stubs.notificationServer,
  };
};

/**
 * Tears down the integration test environment.
 */
export const teardownIntegrationTest = async (
  ctx: TestContext,
): Promise<void> => {
  await ctx.app.close();
  ctx.paymentServer.close();
  ctx.weightServer.close();
  ctx.notificationServer.close();
  await ctx.postgresContainer.stop();
  await ctx.redisContainer.stop();
};

/**
 * Seeds the test database with aircraft types, flights, passengers, and seats.
 * Mirrors the production seed script but with controlled test data.
 */
const seedTestData = async (dataSource: DataSource): Promise<void> => {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`
      INSERT INTO aircraft_type (id, name, rows, columns)
      VALUES
        ('aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa', 'A320', 30, 'A,B,C,D,E,F')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO flight (id, flight_number, aircraft_type_id, departure_time, status)
      VALUES
        ('ffffffff-ffff-4fff-bfff-ffffffffffff', 'SH-TEST-1', 'aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa', NOW() + INTERVAL '24 hours', 'SCHEDULED'),
        ('eeeeeeee-eeee-4eee-beee-eeeeeeeeeeee', 'SH-TEST-2', 'aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa', NOW() + INTERVAL '48 hours', 'SCHEDULED')
      ON CONFLICT DO NOTHING
    `);
    const passengerIds = [
      "11111111-1111-4111-b111-111111111111",
      "22222222-2222-4222-b222-222222222222",
      "33333333-3333-4333-b333-333333333333",
      "44444444-4444-4444-b444-444444444444",
      "55555555-5555-4555-b555-555555555555",
      "66666666-6666-4666-b666-666666666666",
      "77777777-7777-4777-b777-777777777777",
      "88888888-8888-4888-b888-888888888888",
      "99999999-9999-4999-b999-999999999999",
      "00000000-0000-4000-b000-000000000010",
    ];
    for (let i = 0; i < passengerIds.length; i++) {
      await queryRunner.query(
        `INSERT INTO passenger (id, first_name, last_name, email)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [
          passengerIds[i],
          `TestUser${i + 1}`,
          `Last${i + 1}`,
          `testuser${i + 1}@example.com`,
        ],
      );
    }
    const columns = ["A", "B", "C", "D", "E", "F"];
    const flightIds = [
      "ffffffff-ffff-4fff-bfff-ffffffffffff",
      "eeeeeeee-eeee-4eee-beee-eeeeeeeeeeee",
    ];
    for (const flightId of flightIds) {
      for (let row = 1; row <= 30; row++) {
        for (const col of columns) {
          await queryRunner.query(
            `INSERT INTO seat (flight_id, row, "column", status)
             VALUES ($1, $2, $3, 'AVAILABLE')
             ON CONFLICT DO NOTHING`,
            [flightId, row, col],
          );
        }
      }
    }
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
};

/**
 * Generates a JWT token for a given passenger ID.
 */
export const getAuthToken = (passengerId: string): string => {
  return generateTestJwt({ sub: passengerId, secret: JWT_SECRET });
};

/**
 * Creates a supertest agent with auth header set.
 */
export const authenticatedRequest = (
  app: INestApplication<App>,
  passengerId: string,
): request.Agent => {
  const token = getAuthToken(passengerId);
  return request
    .agent(app.getHttpServer())
    .set("Authorization", `Bearer ${token}`);
};

/** Well-known test IDs */
export const TEST_FLIGHT_ID = "ffffffff-ffff-4fff-bfff-ffffffffffff";
export const TEST_FLIGHT_ID_2 = "eeeeeeee-eeee-4eee-beee-eeeeeeeeeeee";
export const TEST_PASSENGER_IDS = [
  "11111111-1111-4111-b111-111111111111",
  "22222222-2222-4222-b222-222222222222",
  "33333333-3333-4333-b333-333333333333",
  "44444444-4444-4444-b444-444444444444",
  "55555555-5555-4555-b555-555555555555",
  "66666666-6666-4666-b666-666666666666",
  "77777777-7777-4777-b777-777777777777",
  "88888888-8888-4888-b888-888888888888",
  "99999999-9999-4999-b999-999999999999",
  "00000000-0000-4000-b000-000000000010",
] as const;

/**
 * Helper to get a seat ID for a given flight from the seat map endpoint.
 */
export const getAvailableSeatId = async (
  app: INestApplication<App>,
  passengerId: string,
  flightId: string,
): Promise<string> => {
  const token = getAuthToken(passengerId);
  const response = await request(app.getHttpServer())
    .get(`/api/v1/flights/${flightId}/seats`)
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  const seats = response.body.seats as Array<{
    id: string;
    status: string;
  }>;
  const available = seats.find((s) => s.status === "AVAILABLE");
  if (!available) {
    throw new Error("No available seats found");
  }
  return available.id;
};

/**
 * Helper to get all available seat IDs for a given flight.
 */
export const getAllAvailableSeatIds = async (
  app: INestApplication<App>,
  passengerId: string,
  flightId: string,
): Promise<string[]> => {
  const token = getAuthToken(passengerId);
  const response = await request(app.getHttpServer())
    .get(`/api/v1/flights/${flightId}/seats`)
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  const seats = response.body.seats as Array<{
    id: string;
    status: string;
  }>;
  return seats.filter((s) => s.status === "AVAILABLE").map((s) => s.id);
};
