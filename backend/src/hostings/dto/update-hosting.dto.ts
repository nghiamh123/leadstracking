import { PartialType } from '@nestjs/mapped-types';
import { CreateHostingDto } from './create-hosting.dto.js';

export class UpdateHostingDto extends PartialType(CreateHostingDto) {}
