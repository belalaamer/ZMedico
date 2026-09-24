import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "./lib/observability/sentry";
import { reportClientError } from "./lib/observability/reportError";
import { recoverFromStaleChunk } from "./lib/chunkRecovery";

// Fire-and-forget: no-op unless VITE_SENTRY_DSN is set.
void initSentry();

// Global unhandled-error capture → self-hosted DB logging.
window.addEventListener("error", (event) => {
  const candidate = event.error ?? new Error(event.message || "Window error");
  void reportClientError({
    kind: "error",
    message: event.error?.message ?? event.message ?? String(event),
    stack: event.error?.stack,
  });
  recoverFromStaleChunk(candidate);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  void reportClientError({
    kind: "unhandledrejection",
    message:
      reason instanceof Error
        ? reason.message
        : String(reason ?? "Unhandled promise rejection"),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  recoverFromStaleChunk(reason);
});

// Vite emits this event when a preloaded code-split asset disappears between
// deployments. Prevent the stale preload error from surfacing when recovery
// has already scheduled a one-time refresh.
window.addEventListener(
  "vite:preloadError",
  ((event: Event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    const error = payload ?? new Error("Unable to preload module");
    if (recoverFromStaleChunk(error)) event.preventDefault();
  }) as EventListener,
);

createRoot(document.getElementById("root")!).render(<App />);
