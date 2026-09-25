import { Module } from '@nestjs/common';
import { HostingsController } from './hostings.controller.js';
import { HostingsService } from './hostings.service.js';

@Module({
  controllers: [HostingsController],
  providers: [HostingsService],
})
export class HostingsModule {}
