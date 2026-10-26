import { Component, ReactNode } from "react";
import { reportClientError } from "@/lib/observability/reportError";
import { recoverFromStaleChunk } from "@/lib/chunkRecovery";

type Props = { children: ReactNode };
type State = { error: Error | null };

function readStoredLang(): "en" | "ar" {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("zmedico.lang") === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Surface in console so the next message captures it via read_console_logs.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Render crash:", error, info);

    // Self-hosted DB logging.
    const componentStack =
      info != null &&
      typeof info === "object" &&
      "componentStack" in info &&
      typeof (info as { componentStack: unknown }).componentStack === "string"
        ? (info as { componentStack: string }).componentStack
        : undefined;

    void reportClientError({
      kind: "boundary",
      message: error.message,
      stack: error.stack,
      component: componentStack,
    });

    // A tab left open across a deployment may still reference content-hashed
    // lazy chunks that no longer exist. Reload the fresh no-store HTML shell
    // once instead of leaving the user on a broken error screen.
    recoverFromStaleChunk(error);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    // This boundary is the outermost one (App.tsx:303, above I18nProvider at
    // :305), so it cannot call useI18n — the language is read from the same
    // storage key I18nContext writes. It also has to work in the one case where
    // the provider itself is what crashed.
    const ar = readStoredLang() === "ar";
    return (
      <div
        dir={ar ? "rtl" : "ltr"}
        className="min-h-dvh flex items-center justify-center bg-background p-6"
      >
        <div
          role="alert"
          className="max-w-md w-full rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <h1 className="text-lg font-semibold text-foreground mb-2">
            {ar ? "حدث خطأ غير متوقع" : "Something went wrong"}
          </h1>
          <p className="text-sm text-muted-foreground mb-4">
            {ar
              ? "تعذّر عرض هذه الصفحة بسبب خطأ غير متوقع. يمكنك إعادة المحاولة أو تحديث الصفحة."
              : "The app hit an unexpected error while rendering. You can try again or reload the page."}
          </p>
          <details className="mb-4" open={import.meta.env.DEV}>
            <summary className="text-xs text-muted-foreground cursor-pointer select-none">
              {ar ? "تفاصيل تقنية" : "Technical details"}
            </summary>
            <pre className="mt-2 text-xs bg-muted text-muted-foreground rounded-md p-3 overflow-auto max-h-40 whitespace-pre-wrap break-words">
              {this.state.error.message}
            </pre>
          </details>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={this.reset}
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted"
            >
              {ar ? "إعادة المحاولة" : "Try again"}
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90"
            >
              {ar ? "تحديث الصفحة" : "Reload"}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
