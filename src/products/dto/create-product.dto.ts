import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsUUID,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({
    description: 'SKU único del producto',
    example: 'MED-001',
  })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiProperty({
    description: 'Nombre del producto',
    example: 'Ibuprofeno 400mg',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Descripción opcional',
    example: 'Antiinflamatorio no esteroideo, caja x 20 comprimidos',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Precio unitario (hasta 2 decimales)',
    example: 12.99,
    minimum: 0,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    description: 'URL de la imagen del producto',
    example: 'https://example.com/images/ibuprofeno.png',
  })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'ID de la categoría (opcional)',
    example: '7c9e6b6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}