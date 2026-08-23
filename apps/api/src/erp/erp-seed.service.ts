import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdminAuditLogEntity } from './entities/admin-audit-log.entity';
import { InventoryItemEntity } from './entities/inventory-item.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { PayrollRunEntity } from './entities/payroll-run.entity';

@Injectable()
export class ErpSeedService implements OnModuleInit {
  private readonly logger = new Logger(ErpSeedService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InventoryItemEntity)
    private readonly inventory: Repository<InventoryItemEntity>,
    @InjectRepository(PayrollRunEntity)
    private readonly payroll: Repository<PayrollRunEntity>,
  ) {}

  async onModuleInit() {
    await this.seedIfEmpty();
  }

  private async seedIfEmpty() {
    const invoiceCount = await this.invoices.count();
    if (invoiceCount === 0) {
      await this.invoices.save([
        {
          id: 'INV-1001',
          vendor: 'Northwind Supplies',
          amount: '1250.50',
          status: 'submitted',
        },
        {
          id: 'INV-1002',
          vendor: 'Acme Freight',
          amount: '480.00',
          status: 'draft',
        },
        {
          id: 'INV-1003',
          vendor: 'Orbit Cloud',
          amount: '3200.00',
          status: 'approved',
        },
      ]);
      this.logger.log('Seeded demo invoices');
    }

    const stockCount = await this.inventory.count();
    if (stockCount === 0) {
      await this.inventory.save([
        { sku: 'SKU-01', name: 'Widget A', qty: 120 },
        { sku: 'SKU-02', name: 'Widget B', qty: 45 },
        { sku: 'SKU-03', name: 'Packing Tape', qty: 300 },
      ]);
      this.logger.log('Seeded demo inventory');
    }

    const payrollCount = await this.payroll.count();
    if (payrollCount === 0) {
      await this.payroll.save({
        period: '2026-08',
        status: 'open',
        employees: 42,
        totalGross: '186450.00',
      });
      this.logger.log('Seeded demo payroll period');
    }
  }
}
