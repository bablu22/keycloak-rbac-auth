import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PayrollRunEntity } from './entities/payroll-run.entity';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(PayrollRunEntity)
    private readonly repo: Repository<PayrollRunEntity>,
  ) {}

  async getSummary() {
    const open = await this.repo.findOne({
      where: { status: 'open' },
      order: { startedAt: 'DESC' },
    });
    if (!open) {
      return {
        period: new Date().toISOString().slice(0, 7),
        employees: 0,
        totalGross: 0,
        status: 'open',
      };
    }
    return {
      period: open.period,
      employees: open.employees,
      totalGross: Number(open.totalGross),
      status: open.status,
    };
  }

  async run(startedBy?: string) {
    const open = await this.repo.findOne({
      where: { status: 'open' },
      order: { startedAt: 'DESC' },
    });
    const period =
      open?.period ?? new Date().toISOString().slice(0, 7);
    const jobId = `pay-${Date.now()}`;

    if (open) {
      open.status = 'running';
      open.jobId = jobId;
      open.startedBy = startedBy;
      await this.repo.save(open);
    } else {
      await this.repo.save({
        period,
        status: 'running',
        employees: 0,
        totalGross: '0',
        jobId,
        startedBy,
      });
    }

    return {
      message: 'Payroll run started',
      period,
      jobId,
    };
  }
}
