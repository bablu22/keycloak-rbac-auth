import { Controller, Get, Post } from '@nestjs/common';
import { AuthenticatedUser, Roles } from 'nest-keycloak-connect';

import { PayrollService } from './payroll.service';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get()
  @Roles({ roles: ['payroll_view'] })
  list() {
    return this.payroll.getSummary();
  }

  @Post('run')
  @Roles({ roles: ['payroll_run'] })
  run(@AuthenticatedUser() user: Record<string, unknown>) {
    return this.payroll.run(String(user.sub ?? user.preferred_username ?? ''));
  }
}
