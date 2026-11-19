import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { QueryApplicationsDto } from './dto/query-applications.dto';
import {
  ApiApplicationsDocs,
  ApiCreateApplicationDoc,
  ApiFindAllApplicationsDoc,
  ApiFindOneApplicationDoc,
  ApiUpdateApplicationDoc,
} from './docs/applications.swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { MerchantApplication } from './entities/merchant-application.entity';
import { PaginatedApplicationsResponseDto } from './dto/paginated-applications-response.dto';

@ApiApplicationsDocs()
@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @Roles(UserRole.SALES, UserRole.ADMIN)
  @ApiCreateApplicationDoc()
  async create(
    @Body() dto: CreateApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MerchantApplication> {
    return this.applicationsService.create(dto, user);
  }

  @Get()
  @Roles(UserRole.SALES, UserRole.REVIEWER, UserRole.ADMIN)
  @ApiFindAllApplicationsDoc()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryApplicationsDto,
  ): Promise<PaginatedApplicationsResponseDto> {
    return this.applicationsService.findAll(user, query);
  }

  @Get(':id')
  @Roles(UserRole.SALES, UserRole.REVIEWER, UserRole.ADMIN)
  @ApiFindOneApplicationDoc()
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MerchantApplication> {
    return this.applicationsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.SALES, UserRole.ADMIN)
  @ApiUpdateApplicationDoc()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MerchantApplication> {
    return this.applicationsService.update(id, dto, user);
  }
}
