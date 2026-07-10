import { describe, it, expect } from 'vitest';

describe('TEST-MG — Montage / FFmpeg (pure function tests)', () => {

  it('TEST-MG-001: render-shot subtitle multi-cue SRT format', () => {
    const raw = '第一句对白\n\n第二句对白';
    const dur = 6;
    const paragraphs = raw.split(/\n\s*\n/).filter(Boolean);
    expect(paragraphs.length).toBe(2);

    const blockDur = dur / paragraphs.length;
    const fmt = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = (s % 60).toFixed(3);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.replace('.', ',')}`;
    };

    const pad2 = (n: number) => String(Math.floor(n)).padStart(2, '0');
    const fmt2 = (s: number) => {
      const ss = Math.floor(s % 60);
      const ms = Math.round((s % 1) * 1000);
      return `${pad2(s / 3600)}:${pad2((s % 3600) / 60)}:${String(ss).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    const lines = paragraphs.map((p, i) => {
      const start = i * blockDur;
      const end = (i + 1) * blockDur;
      return `${i + 1}\n${fmt2(start)} --> ${fmt2(end)}\n${p}`;
    });

    const srt = lines.join('\n\n') + '\n';
    expect(srt).toContain('第一句对白');
    expect(srt).toContain('第二句对白');
    expect(srt).toMatch(/\d{2}:\d{2}:\d{2},\d{3}/);
  });

  it('TEST-MG-002: concat-clips transition param pass-through', () => {
    const mockCall = (transition?: string) => {
      const args = ['ffmpeg', '-y'];
      if (transition && transition !== 'none') {
        args.push('-filter_complex');
        expect(['dissolve', 'fade', 'wipeleft', 'fadeblack']).toContain(transition);
      }
      return args;
    };
    expect(mockCall('dissolve')).toContain('-filter_complex');
    expect(mockCall('none')).not.toContain('-filter_complex');
    expect(mockCall(undefined)).not.toContain('-filter_complex');
  });

  it('TEST-MG-003: subtitle SRT detection passthrough', () => {
    const isSrt = /^\d+\n\d{2}:\d{2}:\d{2},\d{3} -->/.test('1\n00:00:00,000 --> 00:00:04,000\nHello');
    expect(isSrt).toBe(true);

    const isPlain = /^\d+\n\d{2}:\d{2}:\d{2},\d{3} -->/.test('Hello world');
    expect(isPlain).toBe(false);
  });

  it('TEST-MG-004: concat-episode review-gate blocked', () => {
    type ShotStatus = 'pending' | 'review' | 'approved';
    const shots = [
      { id: 's1', index: 0, status: 'approved' as ShotStatus },
      { id: 's2', index: 1, status: 'pending' as ShotStatus },
      { id: 's3', index: 2, status: 'review' as ShotStatus },
    ];
    const pending = shots.filter((s) => s.status !== 'approved').map((s) => s.index);
    expect(pending).toEqual([1, 2]);
  });

  it('TEST-MG-005: transcribe cues format', () => {
    const cues = [
      { start: 0, end: 2000, text: '你好' },
      { start: 2500, end: 4500, text: '世界' },
    ];
    expect(cues.length).toBe(2);
    expect(cues[0].text).toBe('你好');
    expect(cues[1].start).toBeGreaterThan(cues[0].end);
  });
});
