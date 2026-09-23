import { Module } from '@nestjs/common';
import { FollowupsController } from './followups.controller.js';
import { FollowupsService } from './followups.service.js';

@Module({
  controllers: [FollowupsController],
  providers: [FollowupsService],
  exports: [FollowupsService],
})
export class FollowupsModule {}
