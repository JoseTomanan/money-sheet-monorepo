interface StoreSyncTestEnvironment {
  mode: string;
  gasUrl?: string;
  apiSecret?: string;
  mock?: string;
}

export function shouldRunLiveStoreSyncTests(
  environment: StoreSyncTestEnvironment,
): boolean {
  return (
    environment.mode === "store-sync-live" &&
    Boolean(environment.gasUrl) &&
    Boolean(environment.apiSecret) &&
    environment.mock !== "true"
  );
}
