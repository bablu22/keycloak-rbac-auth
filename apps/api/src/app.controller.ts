import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser, Public, Roles } from 'nest-keycloak-connect';

import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @Public()
  getHealth() {
    return { status: 'ok', service: 'ledgeros-api' };
  }

  /** Mobile / API clients — Bearer JWT validated by Keycloak AuthGuard */
  @Get('me')
  @Roles({ roles: ['realm:employee'] })
  getMe(@AuthenticatedUser() user: Record<string, unknown>) {
    return {
      sub: user.sub,
      email: user.email,
      name: user.name ?? user.preferred_username,
      realmRoles:
        (user.realm_access as { roles?: string[] } | undefined)?.roles ?? [],
      clientRoles:
        (
          user.resource_access as
            | Record<string, { roles?: string[] }>
            | undefined
        )?.['nest-api']?.roles ?? [],
    };
  }

  @Get('dashboard')
  @Roles({ roles: ['realm:employee', 'realm:admin', 'realm:super_admin'] })
  getDashboard() {
    return {
      message: 'Welcome to the LedgerOS dashboard',
      widgets: ['invoices', 'payroll', 'inventory', 'reports'],
    };
  }
}
