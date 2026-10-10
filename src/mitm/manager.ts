// Minimal stub for @/mitm/manager
// Allows graceful operation without native MITM components

let _cachedPassword: string | null = null;

export const getCachedPassword = () => _cachedPassword;
export const setCachedPassword = (pwd: string) => {
  _cachedPassword = pwd;
};
export const clearCachedPassword = () => {
  _cachedPassword = null;
};

export const getMitmStatus = async () =>
  ({
    running: false,
    pid: null,
    dnsConfigured: false,
    certExists: false,
    orphanedStateDetected: false,
  }) as const;

export const repairMitm = async (_sudoPassword: string): Promise<{ repaired: string[] }> => ({
  repaired: [],
});

export const getAllAgentsStatus = (): never[] => [];

export const startMitm = async (
  _apiKey: string,
  _sudoPassword: string,
  _options: { port?: number } = {}
): Promise<never> => {
  throw new Error("MITM stack has been retired in this deployment.");
};

export const stopMitm = async (_sudoPassword: string): Promise<never> => {
  throw new Error("MITM stack has been retired in this deployment.");
};
