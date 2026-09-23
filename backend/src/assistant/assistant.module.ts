import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';
import { SeoInsightsService } from './seo/seo-insights.service.js';
import { LeadInsightsService } from './leads/lead-insights.service.js';

@Module({
  imports: [DashboardModule],
  controllers: [AssistantController],
  providers: [AssistantService, SeoInsightsService, LeadInsightsService],
})
export class AssistantModule {}
