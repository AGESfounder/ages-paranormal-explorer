import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('App render crash:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const errStr = this.state.error?.stack || String(this.state.error || 'Unknown error');
      const compStack = this.state.errorInfo?.componentStack || '';
      return (
        <div className="fixed inset-0 overflow-auto bg-background text-foreground p-4 flex flex-col items-center">
          <div className="max-w-lg w-full mt-8">
            <h1 className="font-heading text-xl font-bold text-destructive mb-3">
              Something crashed
            </h1>
            <p className="text-sm text-muted-foreground mb-4">
              The app hit a render error. Details below — a hard refresh (Ctrl+Shift+R) may clear it.
            </p>
            <button
              onClick={this.handleReload}
              className="mb-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-heading"
            >
              Reload App
            </button>
            <pre className="text-xs text-destructive/80 bg-card border border-border rounded-lg p-3 overflow-auto whitespace-pre-wrap break-all max-h-[50vh]">
{errStr}
            </pre>
            {compStack && (
              <pre className="text-[10px] text-muted-foreground bg-card border border-border rounded-lg p-3 overflow-auto whitespace-pre-wrap break-all max-h-[30vh] mt-2">
{compStack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}