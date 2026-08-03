// src/components/ErrorBoundary.tsx
import { Component, ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  declare props: Props;
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-appbg flex items-center justify-center p-8" role="alert" aria-live="assertive">
          <div className="max-w-md w-full bg-paper border border-rule rounded-2xl p-8 shadow-lg text-center">
            <div className="w-16 h-16 bg-error-bg border border-error/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-8 h-8 text-error"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-display font-bold text-ink tracking-tight mb-2">Something went wrong</h1>
            <p className="text-ink-2 text-sm leading-relaxed mb-6">
              An unexpected error occurred in the application. Your progress is safe — please refresh the page to
              continue.
            </p>
            {this.state.error && (
              <p className="text-xs font-mono text-ink-2 bg-paper-2 border border-rule rounded-xl p-3 mb-6 text-left break-words">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full h-12 bg-accent hover:opacity-90 text-white font-bold rounded-xl transition-all shadow-sm active:scale-[0.98] cursor-pointer"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
