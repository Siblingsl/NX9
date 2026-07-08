import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { TopazController } from './topaz.controller';
import { TopazService } from './topaz.service';

@Module({
  imports: [AssetsModule],
  controllers: [TopazController],
  providers: [TopazService],
  exports: [TopazService],
})
export class TopazModule {}
