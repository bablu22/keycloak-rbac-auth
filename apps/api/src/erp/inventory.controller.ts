import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Roles } from 'nest-keycloak-connect';

import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Roles({ roles: ['inventory_view'] })
  list() {
    return this.inventory.list();
  }

  @Patch('adjust')
  @Roles({ roles: ['inventory_adjust'] })
  adjust(@Body() body: AdjustInventoryDto) {
    return this.inventory.adjust(body.sku, body.delta);
  }
}
