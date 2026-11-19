import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { ApiAuditDocs, ApiFindAllAuditLogsDoc } from './docs/audit.swagger';

@ApiAuditDocs()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiFindAllAuditLogsDoc()
  async findAll(@Query() query: QueryAuditLogDto) {
    return this.auditService.findAll(query);
  }
}
