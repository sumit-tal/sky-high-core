import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { JwtAuthGuard } from "./jwt-auth.guard";

const TEST_SECRET = "test-secret";
const PASSENGER_ID = "00000000-0000-0000-0000-000000000001";

describe("JwtAuthGuard", () => {
  let guard: JwtAuthGuard;
  let jwtService: JwtService;
  let configService: ConfigService;
  let reflector: Reflector;

  beforeEach(() => {
    jwtService = new JwtService({ secret: TEST_SECRET });
    configService = {
      get: jest.fn().mockReturnValue(TEST_SECRET),
    } as unknown as ConfigService;
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    guard = new JwtAuthGuard(jwtService, configService, reflector);
  });

  const createMockExecutionContext = (
    headers: Record<string, string> = {},
  ): ExecutionContext => {
    const request = { headers, user: undefined };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  };

  describe("When route is marked as public", () => {
    it("Then it should allow access without a token", async () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      const context = createMockExecutionContext();
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe("When authorization header is missing", () => {
    it("Then it should throw UnauthorizedException", async () => {
      const context = createMockExecutionContext();
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        "Missing or malformed authorization header",
      );
    });
  });

  describe("When authorization header has wrong scheme", () => {
    it("Then it should throw UnauthorizedException", async () => {
      const context = createMockExecutionContext({
        authorization: "Basic abc123",
      });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("When authorization header has Bearer but no token", () => {
    it("Then it should throw UnauthorizedException", async () => {
      const context = createMockExecutionContext({ authorization: "Bearer " });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("When token is invalid", () => {
    it("Then it should throw UnauthorizedException", async () => {
      const context = createMockExecutionContext({
        authorization: "Bearer invalid.token.here",
      });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        "Invalid or expired token",
      );
    });
  });

  describe("When token is signed with wrong secret", () => {
    it("Then it should throw UnauthorizedException", async () => {
      const wrongJwtService = new JwtService({ secret: "wrong-secret" });
      const token = wrongJwtService.sign({ sub: PASSENGER_ID });
      const context = createMockExecutionContext({
        authorization: `Bearer ${token}`,
      });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("When token is expired", () => {
    it("Then it should throw UnauthorizedException", async () => {
      const token = jwtService.sign({ sub: PASSENGER_ID }, { expiresIn: 0 });
      const context = createMockExecutionContext({
        authorization: `Bearer ${token}`,
      });
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("When token is valid", () => {
    it("Then it should allow access and attach user to request", async () => {
      const token = jwtService.sign({ sub: PASSENGER_ID });
      const context = createMockExecutionContext({
        authorization: `Bearer ${token}`,
      });
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      const request = context.switchToHttp().getRequest();
      expect(request.user).toBeDefined();
      expect(request.user.sub).toBe(PASSENGER_ID);
    });

    it("Then it should extract iat and exp claims", async () => {
      const token = jwtService.sign({ sub: PASSENGER_ID }, { expiresIn: 3600 });
      const context = createMockExecutionContext({
        authorization: `Bearer ${token}`,
      });
      await guard.canActivate(context);
      const request = context.switchToHttp().getRequest();
      expect(request.user.iat).toBeDefined();
      expect(request.user.exp).toBeDefined();
      expect(typeof request.user.iat).toBe("number");
      expect(typeof request.user.exp).toBe("number");
    });
  });
});
