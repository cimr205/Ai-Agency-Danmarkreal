import { Component, ErrorInfo, ReactNode, ContextType } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { I18nContext } from '@/lib/i18n';
import { isChunkLoadError, reloadOnceForChunkError } from '@/lib/chunkErrorRecovery';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  static contextType = I18nContext;
  declare context: ContextType<typeof I18nContext>;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    if (isChunkLoadError(error)) {
      // Resetting local state can't fix this — the browser already failed to
      // fetch the JS chunk (stale reference from before a new deploy). Only
      // a hard reload re-resolves the current asset URLs.
      reloadOnceForChunkError();
    }
  }

  handleReset = () => {
    if (isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const { t } = this.context;
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-foreground">{t('errorBoundary.title')}</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {this.state.error?.message || t('errorBoundary.description')}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={this.handleReset} className="gap-2">
              <RefreshCw className="h-4 w-4" /> {t('errorBoundary.tryAgain')}
            </Button>
            <Button variant="default" onClick={() => window.location.reload()} className="gap-2">
              {t('errorBoundary.reloadPage')}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
