// src/auth/dto/login.dto.ts
import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'Email registrado',
    example: 'juan@example.com',
    format: 'email',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Contraseña',
    example: 'password123',
    format: 'password',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
