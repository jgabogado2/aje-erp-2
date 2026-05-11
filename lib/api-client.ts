import type { ApiResponse } from '@/lib/api/response';

// Thin fetch wrapper that unwraps the { data, error, message } envelope.
// Throws on non-2xx so TanStack Query treats it as a mutation/query error.

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'same-origin',
  });

  let body: ApiResponse<T> | null = null;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    // body was empty or not JSON
  }

  if (!res.ok) {
    const message = body?.message ?? `Request failed with status ${res.status}`;
    const code = body?.error ?? 'request_failed';
    throw new ApiError(message, code, res.status);
  }

  return (body?.data ?? null) as T;
}

export const apiClient = {
  get: <T>(url: string) => request<T>(url, { method: 'GET' }),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
};
