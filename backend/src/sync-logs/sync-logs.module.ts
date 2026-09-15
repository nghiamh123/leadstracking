import { Module } from '@nestjs/common';
import { GscModule } from '../gsc/gsc.module.js';
import { SyncLogsController } from './sync-logs.controller.js';
import { SyncLogsService } from './sync-logs.service.js';

@Module({
  imports: [GscModule],
  controllers: [SyncLogsController],
  providers: [SyncLogsService],
})
export class SyncLogsModule {}
