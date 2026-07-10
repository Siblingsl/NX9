import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { WorkspacePayload, WorkspaceVisibility } from '@nx9/shared';
import { VoiceWorkspaceService } from './voice-workspace.service';
import { WorkspaceService } from './workspace.service';

@Controller('api/workspaces')
export class WorkspaceController {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly voiceWorkspace: VoiceWorkspaceService,
  ) {}

  @Get()
  list(@Query('ownerId') ownerId?: string) {
    return this.workspaces.list(ownerId);
  }

  @Post()
  create(@Body() body: { title?: string; ownerId?: string; visibility?: WorkspaceVisibility }) {
    return this.workspaces.create(body?.title, body?.ownerId, body?.visibility);
  }

  @Post('import')
  import(@Body() body: { payload: WorkspacePayload; title?: string }) {
    return this.workspaces.importPayload(body.payload, body.title);
  }

  @Get(':id')
  load(@Param('id') id: string) {
    return this.workspaces.load(id);
  }

  @Put(':id')
  save(@Param('id') id: string, @Body() payload: WorkspacePayload) {
    return this.workspaces.save(id, payload);
  }

  @Patch(':id/title')
  rename(@Param('id') id: string, @Body() body: { title: string }) {
    return this.workspaces.rename(id, body.title);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.workspaces.remove(id);
    return { ok: true };
  }

  @Post(':id/voice/generate')
  generateVoice(
    @Param('id') id: string,
    @Body() body?: { lineIds?: string[]; voice?: WorkspacePayload['voice'] },
  ) {
    return this.voiceWorkspace.generateLines(id, body);
  }

  @Get(':id/export')
  export(@Param('id') id: string) {
    return this.workspaces.exportPayload(id);
  }
}
