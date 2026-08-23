import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { createClient } from 'redis';
import helmet from 'helmet';
import cors from 'cors';
import { json, urlencoded } from 'express';

import { AppModule } from './app.module';
import { csrfProtection } from './auth/csrf';
import { assertRuntimeSecrets } from './config/env';
import './auth/session.types';

async function bootstrap() {
  assertRuntimeSecrets();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  const secure = process.env.COOKIE_SECURE === 'true';

  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(
    cors({
      origin: [webOrigin, 'http://127.0.0.1:5173'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());

  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const redisClient = createClient({ url: redisUrl });
  redisClient.on('error', (err) => {
    console.error('Redis error', err);
  });
  await redisClient.connect();

  app.enableShutdownHooks();
  const shutdown = async () => {
    try {
      await redisClient.quit();
    } catch {
      // ignore on shutdown
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET is required');
  }

  app.use(
    session({
      store: new RedisStore({ client: redisClient, prefix: 'ledgeros:' }),
      name: 'ledgeros.sid',
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 8,
      },
    }),
  );

  app.use(csrfProtection);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  console.log(`LedgerOS API listening on http://localhost:${port}`);
}

void bootstrap();
