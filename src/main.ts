import { NestFactory } from "@nestjs/core";
import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT", 3000);
  app.useLogger(app.get(Logger));
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
  await app.listen(port);
}
bootstrap();
