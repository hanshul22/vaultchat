import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RootConfig } from '../config/configuration';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';

/**
 * Global auth module.
 * Registers JwtModule and exports JwtAccessGuard + JwtModule so any
 * feature module can use @UseGuards(JwtAccessGuard) without re-importing.
 */
@Global()
@Module({
  imports: [
    UsersModule,
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cs: ConfigService<RootConfig, true>) => ({
        secret: cs.get('jwt.accessSecret', { infer: true }),
        signOptions: {
          expiresIn: cs.get('jwt.accessTtl', { infer: true }),
        },
      }),
    }),
  ],
  providers: [AuthService, JwtAccessGuard],
  exports: [AuthService, JwtAccessGuard, JwtModule],
  controllers: [AuthController],
})
export class AuthModule {}
