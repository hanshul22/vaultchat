import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageMember } from './entities/storage-member.entity';
import { StorageSpace } from './entities/storage-space.entity';
import { SpaceRoleGuard } from './guards/space-role.guard';
import { StorageSpacesController } from './storage-spaces.controller';
import { StorageSpacesService } from './storage-spaces.service';

@Module({
  imports: [TypeOrmModule.forFeature([StorageSpace, StorageMember])],
  controllers: [StorageSpacesController],
  providers: [StorageSpacesService, SpaceRoleGuard],
  exports: [StorageSpacesService],
})
export class StorageSpacesModule {}
