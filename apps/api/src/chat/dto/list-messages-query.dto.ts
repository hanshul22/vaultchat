import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListMessagesQueryDto {
  /**
   * Page number (1-based). Defaults to 1.
   * Messages are returned oldest-first within the requested page so the
   * UI can render them in chronological order without reversing.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /**
   * Items per page. Defaults to 50, max 100.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
