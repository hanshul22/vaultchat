import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { RootConfig } from '../../config/configuration';

export interface GoogleUserProfile {
  googleId: string;
  email: string;
  fullName: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService<RootConfig, true>) {
    super({
      clientID: configService.get('googleOAuth.clientId', { infer: true }),
      clientSecret: configService.get('googleOAuth.clientSecret', { infer: true }),
      callbackURL: configService.get('googleOAuth.callbackUrl', { infer: true }),
      scope: ['profile', 'email'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const primaryEmail =
      profile.emails?.find((e) => Boolean(e.verified))?.value ?? profile.emails?.[0]?.value;

    if (!primaryEmail) {
      done(
        new UnauthorizedException('No verified email associated with this Google account'),
        undefined,
      );
      return;
    }

    const googleUser: GoogleUserProfile = {
      googleId: profile.id,
      email: primaryEmail,
      fullName: profile.displayName ?? primaryEmail,
    };
    done(null, googleUser);
  }
}