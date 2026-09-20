import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'Electrónica',
    description: 'Nombre único de la categoría',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'Aparatos electrónicos',
    description: 'Descripción opcional',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
