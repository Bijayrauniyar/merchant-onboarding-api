import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { ApiUsersDocs, ApiFindAllUsersDoc } from './docs/users.swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from './enums/user-role.enum';

@ApiUsersDocs()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiFindAllUsersDoc()
  async findAll(@Query() query: QueryUsersDto): Promise<UserResponseDto[]> {
    return this.usersService.findAll(query.role);
  }
}
