import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import type { StoryboardShot, TimelinePayload } from '@nx9/shared';
import { buildTimelineFromShots, timelineToHyperFramesHtml } from '@nx9/shared';
import { AnalyzeService } from './analyze.service';
import { MontageService } from './montage.service';
import { HyperframesService, type RenderResult } from './hyperframes.service';
import { WorkspaceService } from '../workspace/workspace.service';

interface RemotionTask {
  taskId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  progress: number;
  message: string;
  createdAt: number;
  url?: string;
}

const remotionTasks = new Map<string, RemotionTask>();

@Controller('api/montage')
export class MontageController {
  constructor(
    private readonly montage: MontageService,
    private readonly analyze: AnalyzeService,
    private readonly hyperframes: HyperframesService,
    private readonly workspace: WorkspaceService,
  ) {}

  @Get('ffmpeg')
  async ffmpegStatus() {
    const available = await this.montage.checkFfmpeg();
    return { available };
  }

  @Post('contact-sheet')
  contactSheet(@Body() body: { shots: StoryboardShot[]; cols?: number; lineArt?: boolean }) {
    return this.montage.createContactSheet(body.shots ?? [], body.cols ?? 3, body.lineArt ?? false);
  }

  @Post('review-gate')
  reviewGate(@Body() body: { shots: StoryboardShot[]; gateMode?: string }) {
    return this.montage.validateReviewGate(body.shots ?? [], body.gateMode);
  }

  @Post('render-shot')
  renderShot(
    @Body()
    body: {
      videoUrl: string;
      audioUrl?: string;
      subtitle?: string;
      durationSec?: number;
      shots?: StoryboardShot[];
      skipReview?: boolean;
    },
  ) {
    if (!body.skipReview && body.shots?.length) {
      const gate = this.montage.validateReviewGate(body.shots);
      if (!gate.ok) {
        return {
          ok: false,
          status: 'blocked',
          message: `审阅门控：镜头 ${gate.pending.join(', ')} 尚未通过`,
          pending: gate.pending,
        };
      }
    }
    return this.montage.renderShot(body);
  }

  @Post('analyze-reference')
  analyzeReference(
    @Body() body: { videoUrl: string; notes?: string; targetShotCount?: number },
  ) {
    return this.analyze.analyzeReference(body);
  }

  @Post('export-timeline')
  exportTimeline(@Body() body: { shots: StoryboardShot[]; title?: string; transcribeCues?: { start: number; end: number; text: string }[] }) {
    return this.montage.exportTimeline(body.shots ?? [], body.title, body.transcribeCues);
  }

  @Post('concat-episode')
  concatEpisode(
    @Body()
    body: {
      shots: StoryboardShot[];
      requireApproved?: boolean;
      title?: string;
      audioUrl?: string;
    },
  ) {
    return this.montage.concatEpisode(body.shots ?? [], {
      requireApproved: body.requireApproved,
      title: body.title,
      audioUrl: body.audioUrl,
    });
  }

  @Post('concat-clips')
  concatClips(@Body() body: { videoUrls: string[]; title?: string; transition?: string }) {
    return this.montage.concatClips(body.videoUrls ?? [], body.title, body.transition);
  }

  @Post('extract-frames')
  extractFrames(@Body() body: { videoUrl: string; count?: number }) {
    return this.analyze.extractFrameHints(body.videoUrl, body.count ?? 2).then((frames) => ({
      ok: frames.length > 0,
      frames,
      message: frames.length ? `已抽取 ${frames.length} 帧` : '抽帧失败，请确认 FFmpeg 与视频路径',
    }));
  }

  @Post('photo-speak')
  photoSpeak(
    @Body()
    body: {
      imageUrl: string;
      text: string;
      voice?: string;
      resolution?: string;
      referenceAudioUrl?: string;
      useLuxTts?: boolean;
      characterId?: string;
    },
  ) {
    return this.montage.createPhotoSpeak(body);
  }

  @Post('mix-audio')
  mixAudio(@Body() body: { audioUrls: string[]; normalize?: boolean }) {
    return this.montage.mixAudio(body.audioUrls ?? [], { normalize: body.normalize });
  }

  @Post('color-grade')
  colorGrade(
    @Body()
    body: { sourceUrl: string; brightness?: number; contrast?: number; saturation?: number },
  ) {
    return this.montage.colorGrade(body);
  }

  @Post('probe-duration')
  probeDuration(@Body() body: { sourceUrl: string }) {
    return this.montage.probeDuration(body.sourceUrl ?? '');
  }

  @Post('depth-pass')
  depthPass(@Body() body: { sourceUrl: string }) {
    return this.montage.generateDepthPass(body);
  }

  @Post('transcribe')
  transcribe(@Body() body: { sourceUrl: string; language?: string }) {
    return this.montage.transcribeAudio(body.sourceUrl ?? '', body.language);
  }

  @Get('hyperframes-preview')
  async hyperframesPreview(
    @Query('workspaceId') workspaceId: string,
    @Res() res: Response,
  ) {
    if (!workspaceId) {
      res.type('text/html').send('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><title>HF Preview</title></head><body><p style="padding:40px;color:red;">缺少 workspaceId 参数</p></body></html>');
      return;
    }
    const payload = await this.workspace.load(workspaceId);
    const shots = payload.storyboard?.shots ?? [];
    const timeline = buildTimelineFromShots(shots, payload.storyboard?.title);
    const html = timelineToHyperFramesHtml(timeline);
    res.type('text/html').send(html);
  }

  @Post('render-hyperframes')
  renderHyperframes(
    @Body() body: { timeline: TimelinePayload; templateId?: string; transitionPack?: string },
  ) {
    return this.hyperframes.renderTimeline(body.timeline, {
      templateId: body.templateId,
      transitionPack: body.transitionPack,
    });
  }

  @Get('tasks/:taskId')
  getTaskStatus(@Param('taskId') taskId: string) {
    const status = this.hyperframes.getTaskStatus(taskId);
    if (!status) return { ok: false, message: 'task not found' };
    return { ok: true, ...status };
  }

  @Post('render-remotion')
  renderRemotion(@Body() body: { timeline: TimelinePayload; codec?: string }) {
    const taskId = `remotion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const task: RemotionTask = {
      taskId,
      status: 'queued',
      progress: 0,
      message: 'Remotion 渲染已入队（P2 功能，当前为异步任务骨架）',
      createdAt: Date.now(),
    };
    remotionTasks.set(taskId, task);
    return { ok: true, taskId, status: 'queued', message: task.message };
  }

  @Get('remotion-tasks/:taskId')
  getRemotionTaskStatus(@Param('taskId') taskId: string) {
    const task = remotionTasks.get(taskId);
    if (!task) return { ok: false, message: 'task not found' };
    return { ok: true, ...task };
  }
}
