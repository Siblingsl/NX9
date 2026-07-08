import { Controller, Get } from '@nestjs/common';
import { APP_VERSION, HOST, PORT } from '../../config/app.config';

@Controller('api')
export class HealthController {
  @Get('status')
  status() {
    return {
      ok: true,
      service: 'nx9-server',
      version: APP_VERSION,
      host: HOST,
      port: PORT,
      time: new Date().toISOString(),
    };
  }
}
