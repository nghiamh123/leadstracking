import { Module } from '@nestjs/common';
import { GscSheetsService } from './gsc-sheets.service.js';
import { GscSyncService } from './gsc-sync.service.js';
import { GscIngestController } from './gsc-ingest.controller.js';

@Module({
  controllers: [GscIngestController],
  providers: [GscSheetsService, GscSyncService],
  exports: [GscSheetsService, GscSyncService],
})
export class GscModule {}
