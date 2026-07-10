import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { GatewayController } from '../src/modules/gateway/gateway.controller';
import { GatewayService } from '../src/modules/gateway/gateway.service';
import { MockGatewayService } from './mocks';
import { SettingsService } from '../src/modules/settings/settings.service';
import { UsageService } from '../src/modules/usage/usage.service';
import { LuxTtsAdapter } from '../src/modules/gateway/luxtts.adapter';
import { VoiceboxAdapter } from '../src/modules/gateway/voicebox.adapter';
import { GridController } from '../src/modules/grid/grid.controller';
import { GridService } from '../src/modules/grid/grid.service';
import { AgentController } from '../src/modules/agent/agent.controller';
import { AgentService } from '../src/modules/agent/agent.service';
import { AssetsService } from '../src/modules/assets/assets.service';

@Injectable()
class MockSettingsService {
  getRaw() {
    return { primaryApiKey: 'mock-key', llmApiKey: 'mock-key', imageApiKey: 'mock-key' };
  }
}

@Injectable()
class MockUsageService {
  async record() {}
}

@Injectable()
class MockLuxTtsAdapter {
  async probe() { return { available: false, baseUrl: '' }; }
}

@Injectable()
class MockVoiceboxAdapter {
  async probe() { return { available: false, baseUrl: '' }; }
}

export async function createGwTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [GatewayController],
    providers: [
      { provide: GatewayService, useClass: MockGatewayService },
      { provide: SettingsService, useClass: MockSettingsService },
      { provide: UsageService, useClass: MockUsageService },
      { provide: LuxTtsAdapter, useClass: MockLuxTtsAdapter },
      { provide: VoiceboxAdapter, useClass: MockVoiceboxAdapter },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

export async function createGridTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [GridController],
    providers: [
      GridService,
      AssetsService,
      { provide: GatewayService, useClass: MockGatewayService },
      { provide: SettingsService, useClass: MockSettingsService },
      { provide: UsageService, useClass: MockUsageService },
      { provide: LuxTtsAdapter, useClass: MockLuxTtsAdapter },
      { provide: VoiceboxAdapter, useClass: MockVoiceboxAdapter },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

export async function createAgentTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [AgentController],
    providers: [
      AgentService,
      { provide: GatewayService, useClass: MockGatewayService },
      { provide: SettingsService, useClass: MockSettingsService },
      { provide: UsageService, useClass: MockUsageService },
      { provide: LuxTtsAdapter, useClass: MockLuxTtsAdapter },
      { provide: VoiceboxAdapter, useClass: MockVoiceboxAdapter },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
