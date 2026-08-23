import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PayrollStatus = 'open' | 'running' | 'completed';

@Entity('payroll_runs')
export class PayrollRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 7 })
  period!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: PayrollStatus;

  @Column('int')
  employees!: number;

  @Column('decimal', { precision: 14, scale: 2 })
  totalGross!: string;

  @Column({ nullable: true })
  jobId?: string;

  @Column({ nullable: true })
  startedBy?: string;

  @CreateDateColumn()
  startedAt!: Date;
}
