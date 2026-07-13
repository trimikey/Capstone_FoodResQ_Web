import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';

export interface ErrorMessage {
  message: string;
  code?: string;
  timestamp: number;
}

/**
 * Trích message thân thiện từ nhiều dạng lỗi: string, Error, AxiosError, object có `message`.
 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;

  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { error?: { message?: string | string[] }; message?: string | string[] }
      | undefined;
    const rawMessage = data?.error?.message || data?.message;
    if (Array.isArray(rawMessage)) return rawMessage.join('\n');
    if (typeof rawMessage === 'string') return rawMessage;
    if (!error.response) {
      return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';
    }
    return (
      error.message ||
      'Có lỗi kết nối, vui lòng thử lại.'
    );
  }

  if (error instanceof Error) return error.message;

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }

  return 'Đã xảy ra lỗi không xác định.';
}

/**
 * Chuẩn hóa lỗi API thành ErrorMessage có code + timestamp.
 */
export function handleApiError(error: unknown): ErrorMessage {
  const code = axios.isAxiosError(error)
    ? error.code ?? error.response?.status?.toString()
    : undefined;
  return {
    message: getErrorMessage(error),
    code,
    timestamp: Date.now(),
  };
}

export function useErrorHandler() {
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearError = useCallback(() => {
    clearTimer();
    setIsVisible(false);
    setError(null);
  }, [clearTimer]);

  const showError = useCallback(
    (input: string | ErrorMessage, duration = 3000) => {
      const normalized: ErrorMessage =
        typeof input === 'string'
          ? { message: input, timestamp: Date.now() }
          : { ...input, timestamp: input.timestamp ?? Date.now() };

      clearTimer();
      setError(normalized);
      setIsVisible(true);

      if (duration > 0) {
        timerRef.current = setTimeout(() => {
          setIsVisible(false);
        }, duration);
      }
    },
    [clearTimer]
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { error, isVisible, showError, clearError };
}
