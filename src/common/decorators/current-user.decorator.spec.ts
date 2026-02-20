import { ExecutionContext } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { CurrentUser, JwtPayload } from "./current-user.decorator";

const PASSENGER_ID = "00000000-0000-0000-0000-000000000001";

function buildMockContext(user: Partial<JwtPayload> | undefined): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function extractDecoratorFactory(): (_data: unknown, ctx: ExecutionContext) => string {
  class TestController {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    handler(@CurrentUser() _userId: string): void {}
  }
  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestController,
    "handler",
  ) as Record<string, { factory: (_data: unknown, ctx: ExecutionContext) => string }>;
  const [entry] = Object.values(metadata);
  return entry.factory;
}

describe("CurrentUser decorator", () => {
  let factory: (_data: unknown, ctx: ExecutionContext) => string;

  beforeEach(() => {
    factory = extractDecoratorFactory();
  });

  describe("When request has a valid JWT payload", () => {
    it("Then it should return the sub claim as the passenger ID", () => {
      const payload: JwtPayload = { sub: PASSENGER_ID, iat: 1000, exp: 2000 };
      const ctx = buildMockContext(payload);
      const result = factory(undefined, ctx);
      expect(result).toBe(PASSENGER_ID);
    });
  });

  describe("When sub claim is a different UUID", () => {
    it("Then it should return that UUID", () => {
      const otherId = "00000000-0000-0000-0000-000000000099";
      const payload: JwtPayload = { sub: otherId, iat: 1000, exp: 2000 };
      const ctx = buildMockContext(payload);
      const result = factory(undefined, ctx);
      expect(result).toBe(otherId);
    });
  });

  describe("When request user has iat and exp claims", () => {
    it("Then it should still return only the sub claim", () => {
      const payload: JwtPayload = { sub: PASSENGER_ID, iat: 1700000000, exp: 1700003600 };
      const ctx = buildMockContext(payload);
      const result = factory(undefined, ctx);
      expect(typeof result).toBe("string");
      expect(result).toBe(PASSENGER_ID);
    });
  });

  describe("When decorator data argument is provided", () => {
    it("Then it should be ignored and still return sub", () => {
      const payload: JwtPayload = { sub: PASSENGER_ID, iat: 1000, exp: 2000 };
      const ctx = buildMockContext(payload);
      const result = factory("some-data", ctx);
      expect(result).toBe(PASSENGER_ID);
    });
  });
});
