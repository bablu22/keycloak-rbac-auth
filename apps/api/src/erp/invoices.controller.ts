import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser, Roles } from 'nest-keycloak-connect';

import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @Roles({ roles: ['invoice_read'] })
  list() {
    return this.invoices.list();
  }

  @Post()
  @Roles({ roles: ['invoice_create'] })
  create(@Body() body: CreateInvoiceDto) {
    return this.invoices.create(body.vendor, body.amount);
  }

  @Post(':id/approve')
  @Roles({ roles: ['invoice_approve'] })
  approve(
    @Param('id') id: string,
    @AuthenticatedUser() user: Record<string, unknown>,
  ) {
    return this.invoices.approve(id, String(user.sub ?? user.preferred_username ?? ''));
  }

  @Delete(':id')
  @Roles({ roles: ['invoice_delete'] })
  remove(@Param('id') id: string) {
    return this.invoices.remove(id);
  }
}
