export async function withTimeout<T>(
  promise: PromiseLike<T>,
  {
    ms = 8000,
    fallback,
    label,
  }: {
    ms?: number;
    fallback: T;
    label?: string;
  }
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          if (label) {
            console.warn(`[bootstrap-timeout] ${label} exceeded ${ms}ms; using fallback state.`);
          }
          resolve(fallback);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}