import './shared/preload';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { assertProductionEnv } from './shared/prod-env.util';
import { isDemoLanOrigin, isDemoMode } from './shared/demo-mode.util';
import { ProductionSafeExceptionFilter } from './shared/http-exception.filter';
import { json, urlencoded } from 'express';
import { requestIpAllowed } from './shared/ip-allowlist.util';

async function bootstrap() {
  assertProductionEnv();

  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.use(helmet());
  app.use((req, res, next) => {
    if (requestIpAllowed(req)) return next();
    res.status(403).json({ message: 'Forbidden' });
  });
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      // DTOs use manual validation (see login.dto); whitelist strips undecorated fields.
      whitelist: false,
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
  const corsOptions = {
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as string[],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Cookie',
      'X-CSRF-Token',
    ],
  };

  if (isDemoMode()) {
    app.enableCors({
      ...corsOptions,
      origin: (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
        if (!origin) return cb(null, true);
        if (uniqueOrigins.includes(origin)) return cb(null, true);
        cb(null, isDemoLanOrigin(origin));
      },
    });
  } else {
    app.enableCors({
      ...corsOptions,
      origin:
        uniqueOrigins.length > 0
          ? uniqueOrigins
          : (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
              if (!origin) return cb(null, true);
              cb(null, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
            },
    });
  }

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
