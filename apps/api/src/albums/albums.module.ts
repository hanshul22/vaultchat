import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Album } from './entities/album.entity';
import { AlbumMedia } from './entities/album-media.entity';
import { Media } from '../media/entities/media.entity';
import { AlbumsController } from './albums.controller';
import { AlbumsService } from './albums.service';

/**
 * Phase 8 Albums backend module.
 *
 * Registers the Album, AlbumMedia, and Media repositories needed by the
 * service. Auth is handled by the global JwtAccessGuard — no AuthModule
 * import is required here.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Album, AlbumMedia, Media])],
  controllers: [AlbumsController],
  providers: [AlbumsService],
  exports: [AlbumsService],
})
export class AlbumsModule {}
