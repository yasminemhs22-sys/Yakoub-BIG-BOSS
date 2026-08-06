import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Catches render errors so one broken component does not blank the whole site.
 *
 * Deliberately does not use useI18n: if the i18n provider is what failed, this
 * boundary must still render. Hence both languages, hardcoded, in this one file
 * only.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Replaced by real error reporting in Phase 11.
    console.error('Render error:', error, info.componentStack);
  }

  override render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-display-sm text-white">
          Une erreur est survenue · حدث خطأ
        </h1>
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          Recharger · إعادة التحميل
        </button>
        <a href="tel:0563876210" className="text-sm text-muted underline">
          0563876210
        </a>
      </div>
    );
  }
}
