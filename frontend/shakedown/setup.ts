const REQUIRED_READS = [
  "getEntries",
  "getMaster",
  "getCategories",
  "getConfig",
  "getStats",
] as const;

export async function requestWithDeadline<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 60_000,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("request timed out"));
      controller.abort();
    }, timeoutMs);
  });
  return Promise.race([request(controller.signal), deadline]).finally(() => clearTimeout(timeout));
}

export async function warmRequiredReads(
  read: (action: string) => Promise<unknown>,
): Promise<void> {
  const [probe, ...remaining] = REQUIRED_READS;
  await read(probe);
  await Promise.all(remaining.map((action) => read(action)));
}
