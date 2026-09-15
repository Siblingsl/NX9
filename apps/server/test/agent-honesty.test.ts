/**
 * Agent 服务：空环境卡 / 空分镜物化 / 改编 JSON 禁止空成功。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(__dirname, '../src/modules/agent/agent.service.ts'),
  'utf8',
);

describe('agent-service 空成功门禁', () => {
  it('环境卡 / 物化镜表 / 改编策略禁止空成功', () => {
    expect(src).toContain('LLM 未生成有效环境卡，禁止空成功');
    expect(src).toContain('分镜表为空，禁止空成功');
    expect(src).toContain('改编策略 JSON 无法解析，禁止空成功');
    expect(src).toContain('改编策略为空，禁止空成功');
  });

  it('资产抽取空结果 / JSON 失败禁止空成功', () => {
    expect(src).toContain('资产抽取 JSON 无法解析，禁止空成功');
    expect(src).toContain('资产抽取结果为空（无角色与场景），禁止空成功');
  });

  it('规则拆场空结果禁止空成功', () => {
    expect(src).toContain('规则拆场未识别到有效场次，禁止空成功');
  });

  it('LLM 空白内容禁止空成功', () => {
    expect(src).toContain("if (!content.trim()) throw new ServiceUnavailableException('LLM 未返回内容，禁止空成功')");
  });

  it('对白/分镜/场次/事件/骨架空结果禁止空成功', () => {
    expect(src).toContain('LLM 返回的 JSON 对象无法解析，禁止空成功');
    expect(src).toContain('LLM 返回格式无法解析，禁止空成功');
    expect(src).toContain('LLM 未提取到有效对白，禁止空成功');
    expect(src).toContain('LLM 返回的分镜无法解析，禁止空成功');
    expect(src).toContain('骨架解析失败，禁止空成功');
    expect(src).toContain('LLM 未生成有效分镜表，禁止空成功');
    expect(src).toContain('AI 未生成有效镜头，禁止空成功');
    expect(src).toContain('LLM 未生成有效事件，禁止空成功');
    expect(src).toContain('LLM 未生成有效场次，禁止空成功');
    expect(src).toContain('缺少必填字段，禁止空成功');
    expect(src).toContain('无法从原文规划分集，禁止空成功');
    expect(src).toContain('请输入至少 20 字的剧本/对白文本，禁止空成功');
    expect(src).toContain('请输入至少 20 字的小说/章节文本，禁止空成功');
    expect(src).toContain('请输入至少 20 字的小说、剧本或大纲，禁止空成功');
  });
});
