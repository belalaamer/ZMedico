import { Component, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Surface in console so the next message captures it via read_console_logs.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Render crash:", error, info);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-foreground mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground mb-4">
            The app hit an unexpected error while rendering. You can try again or
            reload the page.
          </p>
          <pre className="text-xs bg-muted text-muted-foreground rounded-md p-3 overflow-auto max-h-40 mb-4 whitespace-pre-wrap break-words">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={this.reset}
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;