import { DataSource } from "typeorm";
import { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";

type DataSourceModule = typeof import("./data-source");

describe("dataSource module", () => {
  const originalEnv: NodeJS.ProcessEnv = process.env;

  beforeEach((): void => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach((): void => {
    process.env = originalEnv;
  });

  const importDataSourceModule: () => Promise<DataSourceModule> = async () =>
    import("./data-source");

  it("When configured Then exposes Postgres settings sourced from env", async (): Promise<void> => {
    process.env.DATABASE_URL = "postgres://localhost:5432/sky-high";
    const module: DataSourceModule = await importDataSourceModule();
    const options: PostgresConnectionOptions =
      module.dataSourceOptions as PostgresConnectionOptions;
    expect(options.type).toBe("postgres");
    expect(options.url).toBe("postgres://localhost:5432/sky-high");
    expect(options.entities).toEqual([
      `${__dirname}/../../**/*.entity{.ts,.js}`,
    ]);
    expect(options.migrations).toEqual([
      `${__dirname}/../../../migrations/*{.ts,.js}`,
    ]);
    expect(options.synchronize).toBe(false);
  });

  it("When NODE_ENV is not production Then logging is enabled", async (): Promise<void> => {
    process.env.NODE_ENV = "development";
    const module: DataSourceModule = await importDataSourceModule();
    expect(module.dataSourceOptions.logging).toBe(true);
  });

  it("When NODE_ENV is production Then logging is disabled", async (): Promise<void> => {
    process.env.NODE_ENV = "production";
    const module: DataSourceModule = await importDataSourceModule();
    expect(module.dataSourceOptions.logging).toBe(false);
  });

  it("When importing module Then default export exposes configured options", async (): Promise<void> => {
    process.env.DATABASE_URL = "postgres://localhost:5432/sky-high";
    const module: DataSourceModule = await importDataSourceModule();
    const dataSource: DataSource = module.default;
    expect(dataSource).toBeDefined();
    expect(dataSource.options).toEqual(module.dataSourceOptions);
  });
});
