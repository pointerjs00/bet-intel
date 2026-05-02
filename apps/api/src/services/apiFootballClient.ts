// apps/api/src/services/apiFootballClient.ts

import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

const RATE_LIMIT_KEY = 'apifootball:ratelimit:remaining';
const BASE_URL = 'https://v3.football.api-sports.io';

export class ApiFootballClient {
  private apiKey = process.env.API_FOOTBALL_KEY ?? '';

  private async updateRateLimit(headers: Headers) {
    const remaining = parseInt(headers.get('x-ratelimit-requests-remaining') ?? '-1');
    if (remaining !== -1) {
      await redis.set(RATE_LIMIT_KEY, String(remaining), 'EX', 86_400);
      if (remaining < 20) {
        logger.warn(`[apiFootball] Only ${remaining} calls remaining today`);
      }
    }
  }

  async getRemainingCalls(): Promise<number> {
    const val = await redis.get(RATE_LIMIT_KEY);
    return val ? parseInt(val) : 100;
  }

  async get<T = any>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const remaining = await this.getRemainingCalls();
    if (remaining < 5) {
      throw new Error(`Refusing call — only ${remaining} API-Football calls remaining today`);
    }

    const url = new URL(`${BASE_URL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url.toString(), {
        headers: { 'x-apisports-key': this.apiKey },
        signal: controller.signal,
      });

      await this.updateRateLimit(res.headers);

      if (!res.ok) {
        throw new Error(`API-Football ${res.status} on ${endpoint}`);
      }

      const data = await res.json() as any;
      const errors = data?.errors;
      if (errors && Object.keys(errors).length > 0) {
        throw new Error(`API-Football error: ${Object.values(errors).join(', ')}`);
      }

      return data as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const apiFootball = new ApiFootballClient();
