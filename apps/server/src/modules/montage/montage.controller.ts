import { Body, Controller, Get, Post } from '@nestjs/common';
import type { StoryboardShot } from '@nx9/shared';
import { AnalyzeService } from './analyze.service';
import { MontageService } from './montage.service';

@Controller('api/montage')
export class MontageController {
  constructor(
    private readonly montage: MontageService,
    private readonly analyze: AnalyzeService,
  ) {}

  @Get('ffmpeg')
  async ffmpegStatus() {
    const available = await this.montage.checkFfmpeg();
    return { available };
  }

  @Post('contact-sheet')
  contactSheet(@Body() body: { shots: StoryboardShot[]; cols?: number }) {
    return this.montage.createContactSheet(body.shots ?? [], body.cols ?? 3);
  }

  @Post('review-gate')
  reviewGate(@Body() body: { shots: StoryboardShot[] }) {
    return this.montage.validateReviewGate(body.shots ?? []);
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
  exportTimeline(@Body() body: { shots: StoryboardShot[]; title?: string }) {
    return this.montage.exportTimeline(body.shots ?? [], body.title);
  }

  @Post('concat-episode')
  concatEpisode(
    @Body() body: { shots: StoryboardShot[]; requireApproved?: boolean; title?: string },
  ) {
    return this.montage.concatEpisode(body.shots ?? [], {
      requireApproved: body.requireApproved,
      title: body.title,
    });
  }

  @Post('concat-clips')
  concatClips(@Body() body: { videoUrls: string[]; title?: string }) {
    return this.montage.concatClips(body.videoUrls ?? [], body.title);
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
}
