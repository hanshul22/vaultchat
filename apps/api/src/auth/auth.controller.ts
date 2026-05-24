import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAccessGuard, JwtPayload } from './guards/jwt-access.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/signup
   * Creates a new account and returns an access token + user payload.
   * A refresh token is set as an httpOnly cookie.
   */
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; user: UserResponseDto }> {
    return this.authService.signup(dto, res);
  }

  /**
   * POST /api/v1/auth/login
   * Authenticates with email + password.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; user: UserResponseDto }> {
    return this.authService.login(dto, res);
  }

  /**
   * POST /api/v1/auth/refresh
   * Rotates the refresh token cookie and issues a new access token.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    return this.authService.refresh(req, res);
  }

  /**
   * POST /api/v1/auth/logout
   * Blacklists the current access token and clears the refresh cookie.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAccessGuard)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<void> {
    const authHeader = req.headers?.['authorization'] ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    await this.authService.logout(user.sub, token);
  }

  /**
   * POST /api/v1/auth/forgot-password
   * Sends a password-reset email (best-effort; always returns 200).
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto);
  }

  /**
   * POST /api/v1/auth/reset-password
   * Validates the reset token and updates the password.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(dto);
  }
}
