import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/user-response.dto';
import { Request } from 'express';

@Controller('v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req: Request): Promise<UserResponseDto> {
    const user = req.user as { id: string; email: string };
    const found = await this.usersService.findById(user.id);
    if (!found) {
      throw new Error('User not found');
    }
    return new UserResponseDto(found);
  }
}
