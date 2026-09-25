import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { WebsitesModule } from './websites/websites.module.js';
import { GscModule } from './gsc/gsc.module.js';
import { SyncLogsModule } from './sync-logs/sync-logs.module.js';
import { KeywordsModule } from './keywords/keywords.module.js';
import { LeadsModule } from './leads/leads.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { AssistantModule } from './assistant/assistant.module.js';
import { FollowupsModule } from './followups/followups.module.js';
import { HostingsModule } from './hostings/hostings.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    WebsitesModule,
    GscModule,
    SyncLogsModule,
    KeywordsModule,
    LeadsModule,
    OrdersModule,
    DashboardModule,
    FollowupsModule,
    HostingsModule,
    AssistantModule,
  ],
})
export class AppModule {}
