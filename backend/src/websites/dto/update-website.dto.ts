import { PartialType } from '@nestjs/mapped-types';
import { CreateWebsiteDto } from './create-website.dto.js';

export class UpdateWebsiteDto extends PartialType(CreateWebsiteDto) {}
