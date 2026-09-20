// src/auth/dto/register.dto.ts
import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'Email único del usuario',
    example: 'juan@example.com',
    format: 'email',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Contraseña (mínimo 8 caracteres)',
    example: 'password123',
    minLength: 8,
    format: 'password',
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    description: 'Nombre completo del usuario',
    example: 'Juan Pérez',
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}
