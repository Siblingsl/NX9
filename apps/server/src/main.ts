import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { ClientAbortExceptionFilter } from './common/client-abort.filter';
import { HOST, LIMITS, PORT } from './config/app.config';
import { loadServerEnv } from './config/load-env';

loadServerEnv();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.use(json({ limit: `${LIMITS.jsonBodyMb}mb` }));
  app.use(urlencoded({ extended: true, limit: `${LIMITS.jsonBodyMb}mb` }));

  // 客户端中途断开大 body（工作区 ~16MB 保存被刷新/并发打断）不当作 ERROR 刷屏
  const adapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ClientAbortExceptionFilter(adapterHost));

  await app.listen(PORT, HOST);
  console.log(`NX9 server listening on http://${HOST}:${PORT}`);
}

bootstrap();
