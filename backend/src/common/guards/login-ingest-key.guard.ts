import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/** Xác thực website báo lượt đăng nhập về bằng header x-api-key (LOGIN_INGEST_API_KEY), không qua JWT. */
@Injectable()
export class LoginIngestKeyGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-api-key');
    const expected = this.config.get<string>('LOGIN_INGEST_API_KEY');

    if (!expected) {
      throw new UnauthorizedException('Server chưa cấu hình LOGIN_INGEST_API_KEY');
    }
    const a = Buffer.from(provided ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('API key không hợp lệ hoặc thiếu header x-api-key');
    }
    return true;
  }
}
