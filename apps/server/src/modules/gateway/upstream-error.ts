import { HttpException, HttpStatus } from '@nestjs/common';

function readMessage(body: string): string {
  try {
    const json = JSON.parse(body) as { message?: unknown; error?: unknown };
    if (typeof json.message === 'string') return json.message;
    if (typeof json.error === 'string') return json.error;
    if (json.error && typeof json.error === 'object') {
      const nested = json.error as { message?: unknown; code?: unknown };
      if (typeof nested.message === 'string') return nested.message;
      if (typeof nested.code === 'string') return nested.code;
    }
  } catch {
    // Keep plain-text upstream responses readable.
  }
  return body.trim();
}

export function upstreamException(provider: string, status: number, body: string): HttpException {
  const detail = readMessage(body).replace(/\s+/g, ' ').slice(0, 300) || 'empty response';
  const message = `${provider} upstream error ${status}: ${detail}`;
  const mapped =
    status === 401 ? HttpStatus.UNAUTHORIZED :
    status === 403 ? HttpStatus.FORBIDDEN :
    status === 429 ? HttpStatus.TOO_MANY_REQUESTS :
    status >= 500 ? HttpStatus.BAD_GATEWAY :
    HttpStatus.BAD_GATEWAY;
  return new HttpException(message, mapped);
}

export function upstreamTimeout(provider: string, timeoutMs: number): HttpException {
  return new HttpException(`${provider} request timed out after ${timeoutMs}ms`, HttpStatus.GATEWAY_TIMEOUT);
}
