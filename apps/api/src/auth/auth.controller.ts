import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { toUserView } from '../common/user.view';
import { AuthService, AuthTokens } from './auth.service';
import { AuthUser } from './auth.types';
import { LoginDto } from './dto/login.dto';

const REFRESH_COOKIE = 'clashhub_refresh';
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.validateUser(dto.email, dto.password);
    const tokens = this.auth.issueTokens(user);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, user: toUserView(user) };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const { user, tokens } = await this.auth.refresh(cookie);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, user: toUserView(user) };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  @Get('me')
  async me(@CurrentUser() current: AuthUser) {
    return toUserView(await this.auth.findById(current.id));
  }

  private setRefreshCookie(res: Response, tokens: AuthTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      // Scoped to the auth routes so it never rides along on ordinary API calls.
      path: '/api/auth',
      maxAge: REFRESH_MAX_AGE_MS,
    });
  }
}
