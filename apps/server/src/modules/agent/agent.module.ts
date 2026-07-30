import { Module } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { SkillsModule } from '../skills/skills.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [GatewayModule, SkillsModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
