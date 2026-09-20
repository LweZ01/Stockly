import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { User } from './entities/user.entity.js';

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios (solo ADMIN)' })
  @Roles(Role.ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener usuario — ADMIN o el propio usuario' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() current: User,
  ) {
    if (current.role !== Role.ADMIN && current.id !== id) {
      throw new ForbiddenException('No autorizado');
    }
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar usuario — ADMIN o el propio usuario' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() current: User,
  ) {
    if (current.role !== Role.ADMIN && current.id !== id) {
      throw new ForbiddenException('No autorizado');
    }
    return this.usersService.update(id, dto);
  }

  @Patch(':id/password')
  @ApiOperation({ summary: 'Cambiar contraseña — solo el propio usuario' })
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() current: User,
  ) {
    if (current.id !== id) {
      throw new ForbiddenException('Solo podés cambiar tu propia contraseña');
    }
    return this.usersService.changePassword(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar usuario (soft-delete, solo ADMIN)' })
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }
}
