import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { apiError } from '@/lib/api/response';
import type { NextRequest } from 'next/server';

// Lazily initialise so missing env vars don't break local dev that skips rate-limiting.
let _redis: Redis | null = null;
function getRedis() {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

// 60 mutations/min per authenticated user.
const writeLimit = new Ratelimit({
  redis: getRedis(),
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'rl:write',
  ephemeralCache: new Map(),
});

// 30 req/min for the attachment sign endpoint (storage calls are expensive).
const uploadSignLimit = new Ratelimit({
  redis: getRedis(),
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix: 'rl:upload',
  ephemeralCache: new Map(),
});

// 10 req/min per IP on auth endpoints.
const authLimit = new Ratelimit({
  redis: getRedis(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'rl:auth',
  ephemeralCache: new Map(),
});

export type RateLimitTarget = 'write' | 'upload_sign' | 'auth';

function getIdentifier(req: NextRequest, userId?: string): string {
  if (userId) return userId;
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'anonymous'
  );
}

/**
 * Check the rate limit. Returns a 429 response if exceeded, otherwise null.
 * Call at the top of mutation handlers:
 *
 *   const limited = await checkRateLimit(req, 'write', caller.userId);
 *   if (limited) return limited;
 */
export async function checkRateLimit(
  req: NextRequest,
  target: RateLimitTarget,
  userId?: string
) {
  // Skip when Redis env vars aren't configured (local dev without Upstash).
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  const id = getIdentifier(req, userId);
  const limiter = target === 'upload_sign' ? uploadSignLimit
    : target === 'auth' ? authLimit
    : writeLimit;

  const { success, limit, remaining } = await limiter.limit(id);
  if (!success) {
    const res = apiError('rate_limited', 'Too many requests — please slow down.', 429);
    res.headers.set('X-RateLimit-Limit', String(limit));
    res.headers.set('X-RateLimit-Remaining', String(remaining));
    return res;
  }
  return null;
}
