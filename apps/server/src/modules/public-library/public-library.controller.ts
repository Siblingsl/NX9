import { Body, Controller, Get, Headers, Put } from '@nestjs/common';
import type { PublicLibraryPayload } from '@nx9/shared';
import { PublicLibraryService } from './public-library.service';

@Controller('api/public-library')
export class PublicLibraryController {
  constructor(private readonly library: PublicLibraryService) {}

  @Get()
  load(@Headers('x-nx9-user-id') ownerId?: string) {
    return this.library.load(ownerId);
  }

  @Put()
  save(
    @Headers('x-nx9-user-id') ownerId: string | undefined,
    @Body() payload: PublicLibraryPayload,
  ) {
    return this.library.save(ownerId, payload);
  }
}
