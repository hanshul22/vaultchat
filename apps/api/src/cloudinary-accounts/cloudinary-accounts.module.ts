import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CloudinaryAccount } from './entities/cloudinary-account.entity';
import { Media } from '../media/entities/media.entity';
import { CloudinaryAccountsController } from './cloudinary-accounts.controller';
import { CloudinaryAccountsService } from './cloudinary-accounts.service';

@Module({
  imports: [TypeOrmModule.forFeature([CloudinaryAccount, Media])],
  controllers: [CloudinaryAccountsController],
  providers: [CloudinaryAccountsService],
  exports: [CloudinaryAccountsService],
})
export class CloudinaryAccountsModule {}
