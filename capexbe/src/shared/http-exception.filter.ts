import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ProductionSafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProductionSafeExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const isProd = process.env.NODE_ENV === 'production';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (!isProd) {
        response.status(status).json(raw);
        return;
      }
      const message = this.publicMessage(status, raw);
      response.status(status).json({ statusCode: status, message });
      return;
    }

    const msg = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(msg, exception instanceof Error ? exception.stack : undefined);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: isProd ? 'Internal server error' : msg,
    });
  }

  private publicMessage(status: number, raw: string | object): string | string[] {
    if (typeof raw === 'string') return raw;
    const body = raw as { message?: string | string[] };
    const message = body.message;
    if (Array.isArray(message)) return message;
    if (typeof message === 'string' && message.trim()) return message;
    if (status === HttpStatus.UNAUTHORIZED) return 'Unauthorized';
    if (status === HttpStatus.FORBIDDEN) return 'Forbidden';
    return 'Request failed';
  }
}
