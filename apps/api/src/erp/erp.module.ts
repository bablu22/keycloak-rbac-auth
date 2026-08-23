import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminAuditService } from './admin-audit.service';
import { AdminAuditLogEntity } from './entities/admin-audit-log.entity';
import { InventoryItemEntity } from './entities/inventory-item.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { ErpSeedService } from './erp-seed.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { ReportsController } from './reports.controller';
import { UsersController } from './users.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InvoiceEntity,
      InventoryItemEntity,
      PayrollRunEntity,
      AdminAuditLogEntity,
    ]),
  ],
  controllers: [
    InvoicesController,
    PayrollController,
    InventoryController,
    UsersController,
    ReportsController,
  ],
  providers: [
    KeycloakAdminService,
    InvoicesService,
    InventoryService,
    PayrollService,
    AdminAuditService,
    ErpSeedService,
  ],
})
export class ErpModule {}
