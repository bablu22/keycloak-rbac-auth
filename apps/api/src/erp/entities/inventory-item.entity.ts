import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('inventory_items')
export class InventoryItemEntity {
  @PrimaryColumn()
  sku!: string;

  @Column()
  name!: string;

  @Column('int')
  qty!: number;

  @UpdateDateColumn()
  updatedAt!: Date;
}
