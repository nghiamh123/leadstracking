import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../types/jwt-payload.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
