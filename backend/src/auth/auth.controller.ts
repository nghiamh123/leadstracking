import { Body, Controller, Get, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { AccountEmailService } from './account-email.service.js';
import {
  ConfirmEmailDto,
  ForgotPasswordDto,
  NotificationSettingsDto,
  ResetPasswordWithTokenDto,
} from './dto/email-flows.dto.js';

const COOKIE_NAME = 'access_token';

// sameSite: 'none' + secure: true cho phép cookie hoạt động khi frontend và
// backend ở 2 domain khác nhau (vd 2 tunnel ngrok khác nhau khi demo từ máy
// khác) - browser coi "localhost" là secure context nên vẫn hoạt động bình
// thường khi chạy local, không cần đổi giữa dev/prod.
const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
};

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private accountEmail: AccountEmailService,
  ) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.login(dto.email, dto.password);
    const token = this.authService.signToken(user);

    res.cookie(COOKIE_NAME, token, { ...COOKIE_OPTIONS, maxAge: 12 * 60 * 60 * 1000 });

    return { id: user.id, name: user.name, email: user.email, role: user.role, team: user.team };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('password')
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.authService.changeOwnPassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('notification-settings')
  updateNotificationSettings(@CurrentUser() user: JwtPayload, @Body() dto: NotificationSettingsDto) {
    return this.authService.updateNotificationSettings(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify-email/send')
  sendVerification(@CurrentUser() user: JwtPayload) {
    return this.accountEmail.sendVerification(user.sub);
  }

  /** Không cần đăng nhập: bấm link trong email là đủ (token chứng minh quyền sở hữu hộp thư). */
  @Post('verify-email/confirm')
  confirmEmail(@Body() dto: ConfirmEmailDto) {
    return this.accountEmail.confirmEmail(dto.token);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.accountEmail.forgotPassword(dto.email);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordWithTokenDto) {
    return this.accountEmail.resetPassword(dto.token, dto.newPassword);
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
    return { ok: true };
  }
}
