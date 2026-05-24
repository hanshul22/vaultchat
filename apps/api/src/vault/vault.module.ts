import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CloudinaryAccount } from '../cloudinary-accounts/entities/cloudinary-account.entity';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';

@Module({
  imports: [TypeOrmModule.forFeature([CloudinaryAccount])],
  controllers: [VaultController],
  providers: [VaultService],
})
export class VaultModule {}
