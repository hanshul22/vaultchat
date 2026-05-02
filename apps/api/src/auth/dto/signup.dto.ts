import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class SignupDto {
  @IsString()
  @Length(1, 120)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(10, 72)
  @Matches(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain at least one digit' })
  @Matches(/[^A-Za-z0-9]/, { message: 'Password must contain at least one special character' })
  password!: string;
}
