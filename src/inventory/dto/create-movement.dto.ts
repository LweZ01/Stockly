import {
  IsEnum,
  IsInt,
  Min,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MovementType } from '../enums/movement-type.enum.js';

export class CreateMovementDto {
  @ApiProperty({
    description: 'ID del producto sobre el que se registra el movimiento',
    format: 'uuid',
  })
  @IsUUID()
  productId: string;

  @ApiProperty({
    description: 'Tipo de movimiento',
    enum: MovementType,
    example: MovementType.ENTRY,
  })
  @IsEnum(MovementType)
  type: MovementType;

  @ApiProperty({
    description:
      'Cantidad del movimiento (entero, >0 para ENTRY/EXIT; 0 permitido solo en ADJUSTMENT)',
    example: 50,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional({
    description: 'Motivo del movimiento (texto libre)',
    example: 'Reposición inicial de stock',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
