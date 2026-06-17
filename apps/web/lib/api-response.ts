/**
 * Consistent API response envelope for all Route Handlers.
 * Every endpoint returns { success, data?, error?, meta? }.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

export function ok<T>(data: T, meta?: ApiResponse<T>['meta']): ApiResponse<T> {
  return { success: true, data, ...(meta ? { meta } : {}) };
}

export function err(error: string): ApiResponse<never> {
  return { success: false, error };
}
