import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { InventoryItemEntity } from './entities/inventory-item.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItemEntity)
    private readonly repo: Repository<InventoryItemEntity>,
  ) {}

  async list() {
    return this.repo.find({ order: { sku: 'ASC' } });
  }

  async adjust(sku: string, delta: number) {
    const item = await this.repo.findOne({ where: { sku } });
    if (!item) throw new NotFoundException('SKU not found');
    const nextQty = item.qty + delta;
    if (!Number.isFinite(nextQty) || nextQty < 0) {
      throw new BadRequestException('Resulting quantity cannot be negative');
    }
    item.qty = nextQty;
    return this.repo.save(item);
  }
}
