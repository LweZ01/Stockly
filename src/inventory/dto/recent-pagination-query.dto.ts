import { Max } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class RecentPaginationQueryDto extends PaginationQueryDto {
  @Max(50)
  override limit?: number = 10;
}
