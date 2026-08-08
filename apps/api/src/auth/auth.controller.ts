import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import ms from 'ms';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { toUserView } from '../common/user.view';
import { AuthService, AuthTokens } from './auth.service';
import { AuthUser } from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

const REFRESH_COOKIE = 'clashhub_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  // Stricter than the global default: brute-forcing passwords should be slow,
  // legitimate retries after a typo should not be blocked.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.validateUser(dto.email, dto.password);
    const tokens = await this.auth.issueTokens(user);
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

  // Requires a valid access token (not @Public()) — unlike login/refresh,
  // there is no bootstrapping problem here, and the current password check
  // inside AuthService.changePassword is not a substitute for the session
  // itself being genuine. Throttled same as login: this is another password
  // guess, just against a session instead of a cookie-less request.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() current: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(current.id, dto.currentPassword, dto.newPassword);

    // changePassword() just revoked every session for this user, including
    // the one this very request is riding on — issue a fresh pair so the
    // caller isn't logged out by the action they just took.
    const user = await this.auth.findById(current.id);
    const tokens = await this.auth.issueTokens(user);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, user: toUserView(user) };
  }

  // @Public() rather than requiring a valid access token: the caller's
  // access token may already be expired by the time they log out, and
  // logout should still succeed. The refresh cookie itself (if any) is what
  // tells us whose session to invalidate — see AuthService.invalidateSession.
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.auth.invalidateSession(cookie);
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
      // Derived from the same env var the token itself is signed with
      // (JWT_REFRESH_TTL) so the cookie can never outlive — or expire
      // before — the token it carries.
      maxAge: ms((this.config.get<string>('JWT_REFRESH_TTL') ?? '7d') as ms.StringValue),
    });
  }
}
