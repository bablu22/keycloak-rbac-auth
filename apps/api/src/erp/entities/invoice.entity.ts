import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type InvoiceStatus = 'draft' | 'submitted' | 'approved';

@Entity('invoices')
export class InvoiceEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  vendor!: string;

  @Column('decimal', { precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: InvoiceStatus;

  @Column({ nullable: true })
  approvedBy?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
