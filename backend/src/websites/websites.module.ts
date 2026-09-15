import { Module } from '@nestjs/common';
import { GscModule } from '../gsc/gsc.module.js';
import { WebsitesController } from './websites.controller.js';
import { WebsitesService } from './websites.service.js';

@Module({
  imports: [GscModule],
  controllers: [WebsitesController],
  providers: [WebsitesService],
  exports: [WebsitesService],
})
export class WebsitesModule {}
