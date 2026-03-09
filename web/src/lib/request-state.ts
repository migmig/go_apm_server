export type AsyncViewState = 'loading' | 'ready' | 'empty' | 'error';

interface GetAsyncViewStateOptions {
  hasData: boolean;
  isLoading: boolean;
  isEmpty: boolean;
  errorMessage: string | null;
}

export function getAsyncViewState({
  hasData,
  isLoading,
  isEmpty,
  errorMessage,
}: GetAsyncViewStateOptions): AsyncViewState {
  if (isLoading && !hasData) {
    return 'loading';
  }

  if (errorMessage && !hasData) {
    return 'error';
  }

  if (isEmpty) {
    return 'empty';
  }

  return 'ready';
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
