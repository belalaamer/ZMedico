import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "./lib/observability/sentry";
import { reportClientError } from "./lib/observability/reportError";

// Fire-and-forget: no-op unless VITE_SENTRY_DSN is set.
void initSentry();

// Global unhandled-error capture → self-hosted DB logging.
window.addEventListener("error", (event) => {
  void reportClientError({
    kind: "error",
    message: event.error?.message ?? event.message ?? String(event),
    stack: event.error?.stack,
  });
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
});

createRoot(document.getElementById("root")!).render(<App />);
