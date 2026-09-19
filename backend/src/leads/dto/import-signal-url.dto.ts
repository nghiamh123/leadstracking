import { IsInt, IsUrl, Min } from 'class-validator';

export class ImportSignalUrlDto {
  @IsUrl({ require_protocol: true })
  url!: string;

  @IsInt()
  @Min(2000)
  year!: number;
}
