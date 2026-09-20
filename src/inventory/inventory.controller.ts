import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';

import { InventoryService } from './inventory.service.js';
import { CreateMovementDto } from './dto/create-movement.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('movements')
  registerMovement(
    @Body() dto: CreateMovementDto,
    @CurrentUser() currentUser: User,
  ) {
    return this.inventoryService.registerMovement(dto, currentUser.id);
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
