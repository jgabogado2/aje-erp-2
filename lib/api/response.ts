import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

// Standard response envelope used by every /api route in this app.
// Success: { data, error: null, message: null }
// Failure: { data: null, error: <machine code>, message: <human text> }

export interface ApiResponse<T = unknown> {
  data: T | null;
  error: string | null;
  message: string | null;
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json<ApiResponse<T>>(
    { data, error: null, message: null },
    { status }
  );
}

export function apiError(error: string, message: string, status = 400) {
  return NextResponse.json<ApiResponse<null>>(
    { data: null, error, message },
    { status }
  );
}

// Common error helpers — keep call sites short and codes consistent.
export const apiUnauthorized = (msg = 'Not authenticated') =>
  apiError('unauthorized', msg, 401);

export const apiForbidden = (msg = 'You do not have permission to perform this action') =>
  apiError('forbidden', msg, 403);

export const apiNotFound = (msg = 'Resource not found') =>
  apiError('not_found', msg, 404);

export const apiConflict = (msg: string) => apiError('conflict', msg, 409);

export const apiServerError = (msg = 'Internal server error') =>
  apiError('server_error', msg, 500);

export function apiValidationError(err: ZodError) {
  const first = err.issues[0];
  const path = first?.path?.join('.') || '';
  const message = first ? `${path ? `${path}: ` : ''}${first.message}` : 'Invalid input';
  return apiError('validation_error', message, 422);
}

// Catch-all wrapper: turns thrown errors into a 500 with a consistent shape.
// Use sparingly — explicit branches are clearer in most handlers.
export function handleUnknownError(err: unknown) {
  if (err instanceof ZodError) return apiValidationError(err);
  console.error('Unhandled API error:', err);
  return apiServerError();
}
