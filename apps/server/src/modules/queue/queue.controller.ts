import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { QueueService, type ProductionTask } from './queue.service';

@Controller('queue')
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Post('enqueue')
  enqueue(@Body() body: Omit<ProductionTask, 'id' | 'createdAt' | 'status'>) {
    return this.queue.enqueue(body);
  }

  @Get('list')
  list(@Query('workspaceId') workspaceId?: string) {
    return this.queue.list(workspaceId);
  }

  @Post(':id/update')
  update(@Param('id') id: string, @Body() patch: Partial<ProductionTask>) {
    return this.queue.update(id, patch);
  }

  @Post('clear')
  clearDone() {
    return { cleared: this.queue.clearDone() };
  }
}
