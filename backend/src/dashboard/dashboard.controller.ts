import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import { DashboardService } from './dashboard.service.js';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('summary')
  summary(
    @CurrentUser() user: JwtPayload,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('websiteId') websiteId?: string,
    @Query('salesRepId') salesRepId?: string,
  ) {
    return this.dashboardService.summary(user, { start, end, websiteId, salesRepId });
  }

  @Get('trend')
  trend(
    @CurrentUser() user: JwtPayload,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('websiteId') websiteId?: string,
    @Query('salesRepId') salesRepId?: string,
  ) {
    return this.dashboardService.trend(user, { start, end, websiteId, salesRepId });
  }

  @Get('by-website')
  byWebsite(
    @CurrentUser() user: JwtPayload,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('salesRepId') salesRepId?: string,
  ) {
    return this.dashboardService.byWebsite(user, { start, end, salesRepId });
  }

  @Get('export.csv')
  async exportCsv(
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('salesRepId') salesRepId?: string,
  ) {
    const rows = await this.dashboardService.byWebsite(user, { start, end, salesRepId });
    const header = [
      'Website',
      'Traffic',
      'Lead',
      'Đơn hàng',
      'Traffic->Lead (%)',
      'Lead->Đơn (%)',
      'Traffic->Đơn (%)',
    ];
    const csv = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.websiteName,
          r.clicks,
          r.leadCount,
          r.orderCount,
          r.leadRate.toFixed(1),
          r.orderRate.toFixed(1),
          r.totalRate.toFixed(1),
        ].join(','),
      ),
    ].join('\n');

    res.type('text/csv').attachment(`funnel-${start}_${end}.csv`).send('﻿' + csv);
  }
}
