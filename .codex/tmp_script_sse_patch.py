from pathlib import Path

def patch(path, pairs):
    p = Path(path)
    s = p.read_bytes().decode('utf-8-sig')
    norm = s.replace('\r\n', '\n')
    for old, new in pairs:
        if old not in norm:
            raise SystemExit(f'{path}: MISSING:\n{old[:300]}')
        norm = norm.replace(old, new, 1)
    out = norm.replace('\n', '\r\n')
    p.write_bytes(out.encode('utf-8-sig' if s.startswith('\ufeff') else 'utf-8'))
    print(f'patched {path}')

patch(r'F:\code\project\NX9\apps\server\src\modules\agent\agent.service.ts', [
    ("""    return {
      ok: true,
      patch: (parsed.patch ?? parsed) as Record<string, unknown>,
      explanation: String(parsed.explanation ?? parsed.assistantText ?? '已生成补丁，请确认后应用。'),
    };
  }

  async scriptExport(""",
     """    return {
      ok: true,
      patch: (parsed.patch ?? parsed) as Record<string, unknown>,
      explanation: String(parsed.explanation ?? parsed.assistantText ?? '已生成补丁，请确认后应用。'),
    };
  }

  /** Script 3.3: 技能轨 SSE——先流式回传正文，最后仍按同一 JSON 契约收敛。 */
  async scriptSkillStream(
    body: { skillId: string; userInstruction?: string; package: Record<string, unknown> },
    userId: string | undefined,
    onChunk: (text: string) => void,
  ): Promise<{ ok: true; patch: Record<string, unknown>; explanation: string }> {
    const chipId = (body.skillId ?? '').trim();
    const skillName = resolveScriptDeskSkillName(chipId);
    const title = String((body.package?.brief as Record<string, unknown> | undefined)?.title ?? '').trim();
    const legacy =
      DEFAULT_SCRIPT_DESK_SKILL_PROMPTS[chipId as ScriptDeskSkillId]
      ?? '输出 JSON：{ "patch": {}, "explanation": "" }';
    const system = [
      this.systemFrom(skillName, legacy),
      title ? `当前剧本标题：${title}` : '',
      '必须输出 JSON 对象，含 patch 与 explanation 字段；patch 仅包含需要更新的 ScreenplayPackage 片段。',
    ].filter(Boolean).join('\n\n');

    this.logger.debug(`scriptSkillStream chip=${chipId} → skill=${skillName}`);

    const userParts = [
      body.userInstruction ? `用户指令：${body.userInstruction}` : '',
      `当前剧本包：${JSON.stringify(body.package, null, 2).slice(0, 8000)}`,
    ].filter(Boolean).join('\n\n');

    const content = await this.gateway.proxyLlmStream(
      [
        { role: 'system', content: system },
        { role: 'user', content: userParts },
      ],
      userId,
      onChunk,
    );
    if (!content.trim()) throw new ServiceUnavailableException('LLM 未返回内容');
    const jsonText = content.trim().replace(/^```(?:json)?\\s*/i, '').replace(/\\s*```$/i, '');
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    return {
      ok: true,
      patch: (parsed.patch ?? parsed) as Record<string, unknown>,
      explanation: String(parsed.explanation ?? parsed.assistantText ?? '已生成补丁，请确认后应用。'),
    };
  }

  async scriptExport("""),
])

patch(r'F:\code\project\NX9\apps\server\src\modules\agent\agent.controller.ts', [
    ("""  @Post('script-desk/chat')
  async scriptDeskChat(
    @Body() body: {
      skillId: string;
      userInstruction?: string;
      package: Record<string, unknown>;
    },
    @Headers('x-nx9-user-id') userId?: string,
  ) {
    return this.agent.scriptSkill(body, userId);
  }
""",
     """  @Post('script-desk/chat')
  async scriptDeskChat(
    @Body() body: {
      skillId: string;
      userInstruction?: string;
      package: Record<string, unknown>;
    },
    @Headers('x-nx9-user-id') userId?: string,
  ) {
    return this.agent.scriptSkill(body, userId);
  }

  /** Script 3.3: Agent 技能轨 SSE（chunk 回传 + done/error 事件） */
  @Post('script-desk/chat-stream')
  async scriptDeskChatStream(
    @Body() body: {
      skillId: string;
      userInstruction?: string;
      package: Record<string, unknown>;
    },
    @Headers('x-nx9-user-id') userId: string | undefined,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    try {
      await this.agent.scriptSkillStream(body, userId, (chunk: string) => {
        res.write(`data: ${JSON.stringify({ text: chunk })}\\n\\n`);
      });
      res.write(`data: ${JSON.stringify({ done: true })}\\n\\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: (e as Error).message })}\\n\\n`);
    }
    res.end();
  }
"""),
])

patch(r'F:\code\project\NX9\apps\web\src\api\client.ts', [
    ("""  scriptDeskChat: (body: { skillId: string; userInstruction?: string; package: Record<string, unknown> }, options?: { signal?: AbortSignal }) =>
    request<{ ok: boolean; patch: Record<string, unknown>; explanation: string }>('/api/agent/script-desk/chat', {
      method: 'POST',
      body: JSON.stringify(body),
      signal: options?.signal,
    }),
""",
     """  scriptDeskChat: (body: { skillId: string; userInstruction?: string; package: Record<string, unknown> }, options?: { signal?: AbortSignal }) =>
    request<{ ok: boolean; patch: Record<string, unknown>; explanation: string }>('/api/agent/script-desk/chat', {
      method: 'POST',
      body: JSON.stringify(body),
      signal: options?.signal,
    }),

  scriptDeskChatStream: async (
    body: { skillId: string; userInstruction?: string; package: Record<string, unknown> },
    options?: { signal?: AbortSignal; onChunk?: (text: string) => void },
  ): Promise<{ ok: boolean; full: string }> => {
    const res = await fetch('/api/agent/script-desk/chat-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...userHeaders(),
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(readErrorMessage(text) || res.statusText);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error('技能流式通道不可用');
    const decoder = new TextDecoder();
    let pending = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split('\\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const json = trimmed.slice(5).trim();
        if (!json) continue;
        let parsed: { text?: string; done?: boolean; error?: string };
        try {
          parsed = JSON.parse(json) as { text?: string; done?: boolean; error?: string };
        } catch {
          continue;
        }
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) {
          full += parsed.text;
          options?.onChunk?.(parsed.text);
        }
      }
    }
    if (!full.trim()) throw new Error('技能生成未返回内容');
    return { ok: true, full };
  },
"""),
])

patch(r'F:\code\project\NX9\apps\web\src\engine\script-desk-runner.ts', [
    ("""export async function runScriptDeskSkill(
  skillId: ScriptDeskSkillId,
  pkg: ScreenplayPackage,
  userInstruction: string,
  signal?: AbortSignal,
): Promise<{ assistantText: string; patch?: Partial<ScreenplayPackage> }> {""",
     """export async function runScriptDeskSkill(
  skillId: ScriptDeskSkillId,
  pkg: ScreenplayPackage,
  userInstruction: string,
  signal?: AbortSignal,
  onChunk?: (text: string) => void,
): Promise<{ assistantText: string; patch?: Partial<ScreenplayPackage> }> {"""),
    ("""    const res = await api.scriptDeskChat({
      skillId,
      userInstruction: userInstruction.trim() || undefined,
      package: pkg as unknown as Record<string, unknown>,
    }, { signal });
    const rawPatch = (res.patch ?? {}) as Record<string, unknown>;
""",
     """    let rawPatch: Record<string, unknown>;
    let explanation: string;
    if (onChunk) {
      const streamed = await api.scriptDeskChatStream({
        skillId,
        userInstruction: userInstruction.trim() || undefined,
        package: pkg as unknown as Record<string, unknown>,
      }, { signal, onChunk });
      const parsed = JSON.parse(streamed.full) as {
        patch?: Record<string, unknown>;
        explanation?: string;
      };
      rawPatch = (parsed.patch ?? parsed) as Record<string, unknown>;
      explanation = String(parsed.explanation ?? '已生成补丁，请确认后应用。');
    } else {
      const res = await api.scriptDeskChat({
        skillId,
        userInstruction: userInstruction.trim() || undefined,
        package: pkg as unknown as Record<string, unknown>,
      }, { signal });
      rawPatch = (res.patch ?? {}) as Record<string, unknown>;
      explanation = res.explanation;
    }
"""),
    ("""        assistantText: res.explanation || `一致性检查完成（LLM + 规则 + 专检），诊断 ${merged.length} 条。`,""",
     """        assistantText: explanation || `一致性检查完成（LLM + 规则 + 专检），诊断 ${merged.length} 条。`,"""),
    ("""      assistantText: res.explanation || 'LLM 已生成补丁，请确认后应用。',""",
     """      assistantText: explanation || 'LLM 已生成补丁，请确认后应用。',"""),
])

patch(r'F:\code\project\NX9\apps\web\src\blocks\nx9\ScriptDeskBlock.tsx', [
    ("""      const result = await runScriptDeskSkill(skillId, pkg, enrichedInstruction, ac.signal);""",
     """      const result = await runScriptDeskSkill(
        skillId,
        pkg,
        enrichedInstruction,
        ac.signal,
        (chunk) => setStreamPreview((prev) => prev + chunk),
      );"""),
])
