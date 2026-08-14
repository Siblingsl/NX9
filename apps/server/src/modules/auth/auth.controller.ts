import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthResult, PublicUser } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(
    @Body() body: { name?: string; password?: string },
  ): Promise<AuthResult> {
    return this.auth.register(body?.name ?? '', body?.password ?? '');
  }

  @Post('login')
  login(
    @Body() body: { name?: string; password?: string },
  ): Promise<AuthResult> {
    return this.auth.login(body?.name ?? '', body?.password ?? '');
  }

  @Get('me')
  me(@Headers('x-nx9-auth-token') token?: string): Promise<PublicUser> {
    return this.auth.me(token ?? '');
  }

  @Post('logout')
  logout(
    @Headers('x-nx9-auth-token') token?: string,
  ): Promise<{ ok: boolean }> {
    return this.auth.logout(token ?? '');
  }
}
