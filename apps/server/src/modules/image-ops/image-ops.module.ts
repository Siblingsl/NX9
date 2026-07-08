import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { ImageOpsController } from './image-ops.controller';
import { ImageOpsService } from './image-ops.service';

@Module({
  imports: [AssetsModule],
  controllers: [ImageOpsController],
  providers: [ImageOpsService],
  exports: [ImageOpsService],
})
export class ImageOpsModule {}
