import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';

/** raw-body / body-parser：客户端上传中途断开 */
function isClientAbort(exception: unknown): boolean {
  if (!exception || typeof exception !== 'object') return false;
  const err = exception as {
    type?: string;
    code?: string;
    message?: string;
    name?: string;
  };
  if (err.type === 'request.aborted') return true;
  if (err.code === 'ECONNABORTED') return true;
  if (typeof err.message === 'string' && /request aborted/i.test(err.message)) return true;
  return false;
}

/**
 * 客户端中途断开（刷新/切页/并发保存取消）时 body 未读完会抛 BadRequestError。
 * 这不是业务故障，降级为 debug，避免刷屏 ERROR。
 */
@Catch()
export class ClientAbortExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
  private readonly quietLogger = new Logger('HTTP');

  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (isClientAbort(exception)) {
      this.quietLogger.debug('client aborted request body (ignored)');
      return;
    }
    super.catch(exception, host);
  }
}
