import { Module } from '@nestjs/common';
import { LoginEventsController } from './login-events.controller.js';
import { LoginEventsService } from './login-events.service.js';

@Module({
  controllers: [LoginEventsController],
  providers: [LoginEventsService],
})
export class LoginEventsModule {}
