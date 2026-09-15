import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { KeywordsService, type KeywordSortKey, type SortDir } from './keywords.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin, Role.manager, Role.seo)
@Controller('keywords')
export class KeywordsController {
  constructor(private keywordsService: KeywordsService) {}

  @Get()
  findAll(
    @Query('websiteId') websiteId?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: KeywordSortKey,
    @Query('sortDir') sortDir?: SortDir,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.keywordsService.findAll({
      websiteId,
      search,
      sortBy,
      sortDir,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
