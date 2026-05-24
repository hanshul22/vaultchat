import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { RootConfig } from '../config/configuration';
import { MailModule } from '../mail/mail.module';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { GoogleStrategy } from './strategies/google.strategy';

@Global()
@Module({
  imports: [
    UsersModule,
    PassportModule,
    ConfigModule,
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<RootConfig, true>) => ({
        secret: configService.get('jwt.accessSecret', { infer: true }),
        signOptions: {
          expiresIn: configService.get('jwt.accessTtl', { infer: true }),
        },
      }),
    }),
  ],
  providers: [AuthService, JwtAccessGuard, GoogleStrategy],
  exports: [AuthService, JwtAccessGuard, JwtModule],
  controllers: [AuthController],
})
export class AuthModule {}