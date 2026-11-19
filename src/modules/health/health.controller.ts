import { Controller, Get } from '@nestjs/common';
import { ApiHealthDocs, ApiHealthCheckDoc } from './docs/health.swagger';

@ApiHealthDocs()
@Controller('health')
export class HealthController {
  @Get()
  @ApiHealthCheckDoc()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
