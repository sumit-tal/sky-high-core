import { JwtService } from "@nestjs/jwt";

const DEFAULT_SECRET = "test-jwt-secret";
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

interface GenerateTestJwtOptions {
  readonly sub?: string;
  readonly secret?: string;
  readonly expiresInSeconds?: number;
}

/**
 * Generates a signed JWT for development and testing purposes.
 * Not intended for production use.
 */
export const generateTestJwt = ({
  sub = "00000000-0000-0000-0000-000000000001",
  secret = DEFAULT_SECRET,
  expiresInSeconds = DEFAULT_EXPIRES_IN_SECONDS,
}: GenerateTestJwtOptions = {}): string => {
  const jwtService = new JwtService({ secret });
  return jwtService.sign({ sub }, { expiresIn: expiresInSeconds });
};

if (require.main === module) {
  const secret = process.env.JWT_SECRET ?? DEFAULT_SECRET;
  const sub = process.argv[2] ?? "00000000-0000-0000-0000-000000000001";
  const token = generateTestJwt({ sub, secret });
  console.log(`\nGenerated JWT for passenger: ${sub}`);
  console.log(`Secret: ${secret}`);
  console.log(`\nToken:\n${token}\n`);
}
