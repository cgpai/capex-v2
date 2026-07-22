import './shared/preload';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { assertProductionEnv } from './shared/prod-env.util';
import { ProductionSafeExceptionFilter } from './shared/http-exception.filter';
import { json, urlencoded } from 'express';

async function bootstrap() {
  assertProductionEnv();

  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.use(helmet());
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );
  app.useGlobalFilters(new ProductionSafeExceptionFilter());

  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const uniqueOrigins = [...new Set(corsOrigins)];
  if (isProd && uniqueOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must be set in production (see capexbe/.env.example)');
  }
  app.enableCors({
    origin:
      uniqueOrigins.length > 0
        ? uniqueOrigins
        : (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
            if (!origin) return cb(null, true);
            cb(null, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
          },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Cookie',
      'X-CSRF-Token',
    ],
  });

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
