import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './auth/decorators/public.decorator';

@SkipThrottle()
@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', ts: Date.now() };
  }

  @Public()
  @Get('ready')
  ready() {
    return { status: 'ready', ts: Date.now() };
  }
}
