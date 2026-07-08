import { Controller, Get, Param, Post, Body, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TasksService, type TaskRecord } from './tasks.service';

@Controller('api/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list() {
    return this.tasks.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    const task = this.tasks.get(id);
    if (!task) return { ok: false, message: '任务不存在' };
    return task;
  }

  @Post()
  create(@Body() body: { type: TaskRecord['type']; message?: string }) {
    return this.tasks.create(body.type, body.message);
  }

  @Post(':id/progress')
  progress(
    @Param('id') id: string,
    @Body() body: { progress?: number; status?: TaskRecord['status']; message?: string; result?: unknown },
  ) {
    return this.tasks.patch(id, body) ?? { ok: false };
  }

  @Sse(':id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const task = this.tasks.get(id);
      if (!task) {
        subscriber.next({ data: { error: '任务不存在' } } as MessageEvent);
        subscriber.complete();
        return;
      }
      subscriber.next({ data: task } as MessageEvent);
      const unsub = this.tasks.subscribe(id, (t) => {
        subscriber.next({ data: t } as MessageEvent);
        if (t.status === 'done' || t.status === 'failed' || t.status === 'cancelled') {
          subscriber.complete();
        }
      });
      return () => unsub();
    });
  }

  /** Fallback polling endpoint for environments without SSE. */
  @Get(':id/poll')
  poll(@Param('id') id: string) {
    return this.tasks.get(id) ?? { ok: false };
  }
}
