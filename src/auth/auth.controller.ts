import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import ms from 'ms';

import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { env } from '../config/env.js';

const REFRESH_TOKEN_COOKIE = 'refreshToken';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar un nuevo usuario' })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    const { password, ...safeUser } = user;
    return safeUser;
  }

  @Post('login')
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Devuelve un access token en el body y setea el refresh token como cookie httpOnly.',
  })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.login(dto);

    this.setRefreshTokenCookie(res, refreshToken);

    const { password, ...safeUser } = user;
    return { accessToken, user: safeUser };
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Renovar el access token',
    description:
      'Requiere la cookie httpOnly "refreshToken" (se envía automáticamente por el navegador; no se puede probar desde Swagger UI sin haber hecho login primero desde el mismo origen). Rota el refresh token en cada uso.',
  })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!token) {
      throw new UnauthorizedException('No hay refresh token');
    }

    const { accessToken, refreshToken } =
      await this.authService.refreshTokens(token);

    this.setRefreshTokenCookie(res, refreshToken);
    return { accessToken };
  }

  @Post('logout')
  @ApiOperation({
    summary: 'Cerrar sesión',
    description:
      'Revoca el refresh token actual (vía cookie httpOnly) y la limpia.',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (token) {
      await this.authService.logout(token);
    }
    res.clearCookie(REFRESH_TOKEN_COOKIE);
  }

  private setRefreshTokenCookie(res: Response, token: string): void {
    res.cookie(REFRESH_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: ms(env.jwt.refreshExpiresIn as ms.StringValue),
    });
  }
}
