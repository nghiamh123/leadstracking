import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/** Xác thực request đến từ hệ thống ngoài (vd. Google Apps Script) bằng header x-api-key, không qua JWT người dùng. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-api-key');
    const expected = this.config.get<string>('GSC_INGEST_API_KEY');

    if (!expected) {
      throw new UnauthorizedException('Server chưa cấu hình GSC_INGEST_API_KEY');
    }
    if (!provided || provided !== expected) {
      throw new UnauthorizedException('API key không hợp lệ hoặc thiếu header x-api-key');
    }
    return true;
  }
}
