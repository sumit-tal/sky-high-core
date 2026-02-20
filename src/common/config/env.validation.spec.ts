import { envValidationSchema } from "./env.validation";

const VALID_ENV = {
  DATABASE_URL: "postgres://localhost:5432/skyhigh",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "super-secret",
  PAYMENT_SERVICE_URL: "http://localhost:4001",
  WEIGHT_SERVICE_URL: "http://localhost:4002",
  NOTIFICATION_SERVICE_URL: "http://localhost:4003",
};

describe("envValidationSchema", () => {
  describe("When all required fields are provided", () => {
    it("Then it should pass validation without errors", () => {
      const { error } = envValidationSchema.validate(VALID_ENV);
      expect(error).toBeUndefined();
    });
  });

  describe("When NODE_ENV is not provided", () => {
    it("Then it should default to 'development'", () => {
      const { value } = envValidationSchema.validate(VALID_ENV);
      expect(value.NODE_ENV).toBe("development");
    });
  });

  describe("When NODE_ENV has an invalid value", () => {
    it("Then it should fail validation", () => {
      const { error } = envValidationSchema.validate({
        ...VALID_ENV,
        NODE_ENV: "staging",
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain("NODE_ENV");
    });
  });

  describe("When NODE_ENV is a valid value", () => {
    it.each(["development", "production", "test"])(
      "Then it should accept '%s'",
      (nodeEnv) => {
        const { error } = envValidationSchema.validate({
          ...VALID_ENV,
          NODE_ENV: nodeEnv,
        });
        expect(error).toBeUndefined();
      },
    );
  });

  describe("When PORT is not provided", () => {
    it("Then it should default to 3000", () => {
      const { value } = envValidationSchema.validate(VALID_ENV);
      expect(value.PORT).toBe(3000);
    });
  });

  describe("When DATABASE_URL is missing", () => {
    it("Then it should fail validation", () => {
      const { DATABASE_URL: _, ...rest } = VALID_ENV;
      const { error } = envValidationSchema.validate(rest);
      expect(error).toBeDefined();
      expect(error?.message).toContain("DATABASE_URL");
    });
  });

  describe("When REDIS_URL is missing", () => {
    it("Then it should fail validation", () => {
      const { REDIS_URL: _, ...rest } = VALID_ENV;
      const { error } = envValidationSchema.validate(rest);
      expect(error).toBeDefined();
      expect(error?.message).toContain("REDIS_URL");
    });
  });

  describe("When JWT_SECRET is missing", () => {
    it("Then it should fail validation", () => {
      const { JWT_SECRET: _, ...rest } = VALID_ENV;
      const { error } = envValidationSchema.validate(rest);
      expect(error).toBeDefined();
      expect(error?.message).toContain("JWT_SECRET");
    });
  });

  describe("When PAYMENT_SERVICE_URL is missing", () => {
    it("Then it should fail validation", () => {
      const { PAYMENT_SERVICE_URL: _, ...rest } = VALID_ENV;
      const { error } = envValidationSchema.validate(rest);
      expect(error).toBeDefined();
      expect(error?.message).toContain("PAYMENT_SERVICE_URL");
    });
  });

  describe("When PAYMENT_SERVICE_URL is not a valid URI", () => {
    it("Then it should fail validation", () => {
      const { error } = envValidationSchema.validate({
        ...VALID_ENV,
        PAYMENT_SERVICE_URL: "not-a-url",
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain("PAYMENT_SERVICE_URL");
    });
  });

  describe("When WEIGHT_SERVICE_URL is missing", () => {
    it("Then it should fail validation", () => {
      const { WEIGHT_SERVICE_URL: _, ...rest } = VALID_ENV;
      const { error } = envValidationSchema.validate(rest);
      expect(error).toBeDefined();
      expect(error?.message).toContain("WEIGHT_SERVICE_URL");
    });
  });

  describe("When NOTIFICATION_SERVICE_URL is missing", () => {
    it("Then it should fail validation", () => {
      const { NOTIFICATION_SERVICE_URL: _, ...rest } = VALID_ENV;
      const { error } = envValidationSchema.validate(rest);
      expect(error).toBeDefined();
      expect(error?.message).toContain("NOTIFICATION_SERVICE_URL");
    });
  });

  describe("When numeric fields are not provided", () => {
    it("Then it should apply all defaults", () => {
      const { value } = envValidationSchema.validate(VALID_ENV);
      expect(value.SEAT_HOLD_TTL_SECONDS).toBe(120);
      expect(value.SEAT_MAP_CACHE_TTL_MS).toBe(2000);
      expect(value.EXCESS_FEE_PER_KG).toBe(10.0);
      expect(value.MAX_BAGGAGE_WEIGHT_KG).toBe(25);
      expect(value.RATE_LIMIT_WINDOW_MS).toBe(2000);
      expect(value.RATE_LIMIT_MAX_REQUESTS).toBe(50);
      expect(value.PAYMENT_TIMEOUT_MS).toBe(5000);
      expect(value.PAYMENT_MAX_RETRIES).toBe(3);
      expect(value.PAYMENT_INITIAL_BACKOFF_MS).toBe(500);
      expect(value.WEIGHT_SERVICE_TIMEOUT_MS).toBe(5000);
      expect(value.NOTIFICATION_TIMEOUT_MS).toBe(5000);
      expect(value.SWEEP_INTERVAL_SECONDS).toBe(30);
      expect(value.ABUSE_RETENTION_DAYS).toBe(90);
    });
  });

  describe("When numeric fields are overridden", () => {
    it("Then it should use the provided values", () => {
      const { value } = envValidationSchema.validate({
        ...VALID_ENV,
        SEAT_HOLD_TTL_SECONDS: 60,
        EXCESS_FEE_PER_KG: 15.5,
        PAYMENT_MAX_RETRIES: 5,
      });
      expect(value.SEAT_HOLD_TTL_SECONDS).toBe(60);
      expect(value.EXCESS_FEE_PER_KG).toBe(15.5);
      expect(value.PAYMENT_MAX_RETRIES).toBe(5);
    });
  });
});
