/**
 * Script 3.3：Agent 技能轨 SSE 契约。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const web = resolve(__dirname, '../../..');
const server = resolve(web, '../server');
const readWeb = (rel: string) => readFileSync(resolve(web, rel), 'utf8');
const readServer = (rel: string) => readFileSync(resolve(server, rel), 'utf8');

describe('Script 3.3 Agent 技能轨 SSE', () => {
  it('服务端提供 chat-stream 端点并调用 scriptSkillStream', () => {
    const controller = readServer('src/modules/agent/agent.controller.ts');
    expect(controller).toContain("@Post('script-desk/chat-stream')");
    expect(controller).toContain('scriptSkillStream');
    expect(controller).toContain("'text/event-stream'");
    const service = readServer('src/modules/agent/agent.service.ts');
    expect(service).toContain('async scriptSkillStream');
    expect(service).toContain('proxyLlmStream');
  });

  it('客户端解析 SSE chunk 并回传 onChunk，runner 走流式分支', () => {
    const client = readWeb('src/api/client.ts');
    expect(client).toContain('scriptDeskChatStream');
    expect(client).toContain('/api/agent/script-desk/chat-stream');
    expect(client).toContain('onChunk');
    const runner = readWeb('src/engine/script-desk-runner.ts');
    expect(runner).toContain('onChunk?: (text: string) => void');
    expect(runner).toContain('api.scriptDeskChatStream');
    expect(runner).toContain('JSON.parse(streamed.full)');
  });

  it('编剧台发送技能时把 chunk 追加到 streamPreview', () => {
    const agentOps = readWeb('src/blocks/nx9/script-desk/use-script-desk-agent.ts');
    expect(agentOps).toContain('(chunk) => setStreamPreview((prev) => prev + chunk)');
  });
});
