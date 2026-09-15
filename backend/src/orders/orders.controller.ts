import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { parse } from 'csv-parse/sync';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role, type OrderStatus } from '../generated/prisma/enums.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';

const TEMPLATE_HEADER = ['Ngày', 'Lead ID', 'Website', 'Giá trị', 'Sản phẩm', 'Sales', 'Trạng thái'];

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin, Role.manager, Role.sales)
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('websiteId') websiteId?: string,
    @Query('status') status?: OrderStatus,
    @Query('salesRepId') salesRepId?: string,
  ) {
    return this.ordersService.findAll(user, { websiteId, status, salesRepId });
  }

  @Get('template.csv')
  template(@Res() res: Response) {
    res.type('text/csv').send(TEMPLATE_HEADER.join(','));
  }

  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: JwtPayload) {
    return this.ordersService.create(dto, user);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: JwtPayload) {
    const records: string[][] = parse(file.buffer, { skip_empty_lines: true });
    const rows = records.slice(1).map((r) => ({
      date: r[0],
      websiteName: r[2],
      value: r[3],
      product: r[4],
      salesRepName: r[5],
      status: r[6],
    }));
    return this.ordersService.importRows(rows, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto, @CurrentUser() user: JwtPayload) {
    return this.ordersService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ordersService.remove(id, user);
  }
}
