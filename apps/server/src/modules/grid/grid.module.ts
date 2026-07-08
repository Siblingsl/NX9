import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { GatewayModule } from '../gateway/gateway.module';
import { GridController } from './grid.controller';
import { GridService } from './grid.service';

@Module({
  imports: [AssetsModule, GatewayModule],
  controllers: [GridController],
  providers: [GridService],
  exports: [GridService],
})
export class GridModule {}
