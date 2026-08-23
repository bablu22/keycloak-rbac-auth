import { Controller, Get } from '@nestjs/common';
import { Roles } from 'nest-keycloak-connect';

@Controller('reports')
export class ReportsController {
  @Get('finance')
  @Roles({ roles: ['report_finance'] })
  finance() {
    return {
      title: 'Finance summary',
      revenue: 482000,
      expenses: 311200,
      margin: 0.354,
    };
  }

  @Get('sales')
  @Roles({ roles: ['report_sales'] })
  sales() {
    return {
      title: 'Sales pipeline',
      openDeals: 18,
      wonThisMonth: 7,
      pipelineValue: 96000,
    };
  }
}
