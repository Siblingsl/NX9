import { Module } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { PictureController } from './picture.controller';

@Module({
  imports: [GatewayModule],
  controllers: [PictureController],
})
export class PictureModule {}
