import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuthGuard,
  KeycloakConnectModule,
  PolicyEnforcementMode,
  ResourceGuard,
  RoleGuard,
  TokenValidation,
} from 'nest-keycloak-connect';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { SessionBearerMiddleware } from './auth/session-bearer.middleware';
import { ErpModule } from './erp/erp.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url:
        process.env.DATABASE_URL ??
        'postgresql://ledgeros:ledgeros@localhost:5433/ledgeros',
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    KeycloakConnectModule.register({
      authServerUrl: process.env.KEYCLOAK_URL ?? 'http://localhost:8080',
      realm: process.env.KEYCLOAK_REALM ?? 'erp-realm',
      clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'nest-api',
      secret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
      policyEnforcement: PolicyEnforcementMode.PERMISSIVE,
      tokenValidation: TokenValidation.OFFLINE,
      // web-bff tokens need audience mapper for nest-api before enabling this
      verifyTokenAudience: false,
    }),
    AuthModule,
    ErpModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ResourceGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionBearerMiddleware).forRoutes('*');
  }
}
