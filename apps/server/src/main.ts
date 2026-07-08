import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { HOST, LIMITS, PORT } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.use(json({ limit: `${LIMITS.jsonBodyMb}mb` }));
  app.use(urlencoded({ extended: true, limit: `${LIMITS.jsonBodyMb}mb` }));

  await app.listen(PORT, HOST);
  console.log(`NX9 server listening on http://${HOST}:${PORT}`);
}

bootstrap();
