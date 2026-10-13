import { Module } from '@nestjs/common';
import { LoginEventsController } from './login-events.controller.js';
import { LoginEventsService } from './login-events.service.js';
import { GeoIpService } from './geo-ip.service.js';

@Module({
  controllers: [LoginEventsController],
  providers: [LoginEventsService, GeoIpService],
})
export class LoginEventsModule {}
