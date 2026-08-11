import { describe, expect, it } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { upstreamException, upstreamTimeout } from '../src/modules/gateway/upstream-error';
import { isRetryableUpstreamStatus, retryAfterMs } from '../src/modules/gateway/upstream-retry';

describe('gateway upstream failure contract', () => {
  it.each([
    [401, HttpStatus.UNAUTHORIZED],
    [403, HttpStatus.FORBIDDEN],
    [429, HttpStatus.TOO_MANY_REQUESTS],
    [500, HttpStatus.BAD_GATEWAY],
    [503, HttpStatus.BAD_GATEWAY],
  ])('maps HTTP %i to %i without losing provider detail', (status, expected) => {
    const error = upstreamException('OpenAI-compatible', status, JSON.stringify({ error: { message: 'provider failure' } }));
    expect(error.getStatus()).toBe(expected);
    expect(error.message).toContain('provider failure');
    expect(error.message).toContain(String(status));
  });

  it('maps timeout separately from an upstream HTTP error', () => {
    const error = upstreamTimeout('Gemini', 30_000);
    expect(error.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
    expect(error.message).toContain('30000ms');
  });

  it('retries only transient upstream statuses', () => {
    expect(isRetryableUpstreamStatus(429)).toBe(true);
    expect(isRetryableUpstreamStatus(503)).toBe(true);
    expect(isRetryableUpstreamStatus(401)).toBe(false);
    expect(isRetryableUpstreamStatus(400)).toBe(false);
  });

  it('honors Retry-After seconds and caps the delay', () => {
    expect(retryAfterMs(new Headers({ 'Retry-After': '2' }), 0)).toBe(2000);
    expect(retryAfterMs(new Headers({ 'Retry-After': '120' }), 0)).toBe(30_000);
  });
});
