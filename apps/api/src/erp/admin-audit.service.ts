import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdminAuditLogEntity } from './entities/admin-audit-log.entity';

@Injectable()
export class AdminAuditService {
  constructor(
    @InjectRepository(AdminAuditLogEntity)
    private readonly repo: Repository<AdminAuditLogEntity>,
  ) {}

  log(
    action: string,
    targetType: string,
    targetId?: string,
    details?: Record<string, unknown>,
    actorSub?: string,
  ) {
    return this.repo.save({
      action,
      targetType,
      targetId,
      details,
      actorSub,
    });
  }
}
