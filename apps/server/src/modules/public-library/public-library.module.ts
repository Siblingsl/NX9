import { Module } from '@nestjs/common';
import { JsonStoreService } from '../../common/json-store.service';
import { PublicLibraryController } from './public-library.controller';
import { PublicLibraryService } from './public-library.service';

@Module({
  controllers: [PublicLibraryController],
  providers: [PublicLibraryService, JsonStoreService],
  exports: [PublicLibraryService],
})
export class PublicLibraryModule {}
