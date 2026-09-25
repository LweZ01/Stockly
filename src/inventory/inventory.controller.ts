import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { InventoryService } from './inventory.service.js';
import { CreateMovementDto } from './dto/create-movement.dto.js';
import { RecentPaginationQueryDto } from './dto/recent-pagination-query.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';

@ApiTags('inventory')
@ApiBearerAuth('access-token')
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('movements')
  @ApiOperation({
    summary: 'Registrar un movimiento de inventario (solo ADMIN)',
    description:
      'Registra ENTRY, EXIT o ADJUSTMENT. El usuario que registra el movimiento se toma del token (no se envía en el body).',
  })
  registerMovement(
    @Body() dto: CreateMovementDto,
    @CurrentUser() currentUser: User,
  ) {
    return this.inventoryService.registerMovement(dto, currentUser.id);
  }

  @Get('products/:productId/stock')
  @ApiOperation({
    summary: 'Consultar stock actual de un producto (solo ADMIN)',
  })
  async getStock(@Param('productId', ParseUUIDPipe) productId: string) {
    const stock = await this.inventoryService.getCurrentStock(productId);
    return { productId, stock };
  }

  @Get('products/:productId/movements')
  @ApiOperation({
    summary: 'Historial de movimientos de un producto (solo ADMIN)',
  })
  getHistory(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.inventoryService.findHistoryByProduct(productId, query);
  }

  @Get('movements/recent')
  @ApiOperation({
    summary: 'Movimientos recientes de todos los productos (solo ADMIN)',
  })
  getRecentMovements(@Query() query: RecentPaginationQueryDto) {
    return this.inventoryService.findRecentMovements(query);
  }
}