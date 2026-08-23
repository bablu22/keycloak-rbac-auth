import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { InvoiceEntity } from './entities/invoice.entity';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly repo: Repository<InvoiceEntity>,
  ) {}

  private map(row: InvoiceEntity) {
    return {
      id: row.id,
      vendor: row.vendor,
      amount: Number(row.amount),
      status: row.status,
      approvedBy: row.approvedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async list() {
    const rows = await this.repo.find({ order: { createdAt: 'ASC' } });
    return rows.map((r) => this.map(r));
  }

  async create(vendor: string, amount: number) {
    const count = await this.repo.count();
    const id = `INV-${1000 + count + 1}`;
    const row = await this.repo.save({
      id,
      vendor: vendor.trim(),
      amount: amount.toFixed(2),
      status: 'draft' as const,
    });
    return this.map(row);
  }

  async approve(id: string, approvedBy?: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Invoice not found');
    row.status = 'approved';
    row.approvedBy = approvedBy;
    await this.repo.save(row);
    return this.map(row);
  }

  async remove(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Invoice not found');
    await this.repo.remove(row);
    return this.map(row);
  }
}
