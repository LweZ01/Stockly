import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';

import { InventoryService } from './inventory.service.js';
import { CreateMovementDto } from './dto/create-movement.dto.js';

// TODO(auth): cuando exista AuthModule, todo el controller queda restringido a ADMIN
//   con @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN) a nivel de clase.
//   Además, userId dejará de venir en el body y se obtendrá de @CurrentUser().
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('movements')
  registerMovement(@Body() dto: CreateMovementDto) {
    const { userId, ...movementDto } = dto;
    return this.inventoryService.registerMovement(movementDto, userId);
  }

  @Get('products/:productId/stock')
  async getStock(@Param('productId', ParseUUIDPipe) productId: string) {
    const stock = await this.inventoryService.getCurrentStock(productId);
    return { productId, stock };
  }

  @Get('products/:productId/movements')
  getHistory(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.inventoryService.findHistoryByProduct(productId);
  }
}
