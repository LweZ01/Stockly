// inventory/dto/create-movement.dto.ts
import {
  IsEnum,
  IsInt,
  Min,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { MovementType } from '../enums/movement-type.enum.js';

export class CreateMovementDto {
  @IsUUID()
  productId: string;

  @IsEnum(MovementType)
  type: MovementType;

  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;

  // TODO(auth): quitar, vendrá de @CurrentUser() cuando exista AuthModule.
  @IsUUID()
  userId: string;
}
