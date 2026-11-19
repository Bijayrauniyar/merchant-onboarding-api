import { MerchantApplication } from '../entities/merchant-application.entity';

/**
 * Standard paginated response envelope for merchant applications.
 */
export class PaginatedApplicationsResponseDto {
  /**
   * Array of application entities matching query criteria and caller scope
   */
  data!: MerchantApplication[];

  /**
   * Total number of records matching query criteria across all pages
   * @example 42
   */
  total!: number;

  /**
   * Current 1-based page number
   * @example 1
   */
  page!: number;

  /**
   * Number of items per page
   * @example 20
   */
  limit!: number;

  /**
   * Total calculated pages
   * @example 3
   */
  totalPages!: number;
}
