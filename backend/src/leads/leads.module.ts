import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';

@Module({
  imports: [UsersModule, OrdersModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
