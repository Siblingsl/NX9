import { Module } from '@nestjs/common';
import { JsonStoreService } from '../../common/json-store.service';
import { GatewayModule } from '../gateway/gateway.module';
import { UsersModule } from '../users/users.module';
import { PrismaWorkspaceStore } from './prisma-workspace.store';
import { VoiceWorkspaceService } from './voice-workspace.service';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';

@Module({
  imports: [GatewayModule, UsersModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, VoiceWorkspaceService, JsonStoreService, PrismaWorkspaceStore],
  exports: [WorkspaceService, PrismaWorkspaceStore],
})
export class WorkspaceModule {}
