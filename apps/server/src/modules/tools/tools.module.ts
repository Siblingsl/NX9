import { Module } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { LinkParserService } from './link-parser.service';
import { VisionToolsService } from './vision-tools.service';
import { ToolsController } from './tools.controller';

@Module({
  imports: [GatewayModule],
  controllers: [ToolsController],
  providers: [LinkParserService, VisionToolsService],
})
export class ToolsModule {}
