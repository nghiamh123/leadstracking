import { IsString, MinLength } from 'class-validator';

export class SyncNowDto {
  @IsString()
  @MinLength(1)
  websiteId!: string;
}
