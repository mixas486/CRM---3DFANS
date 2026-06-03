import { Timestamp } from "firebase/firestore";

export interface SDRSystemConfig {
  globalSDREnabled: boolean;
  sdrMode: 'manual' | 'global_auto';
  updatedAt: Timestamp;
}

export function resolveSDRState(
  chat: any,
  systemConfig: SDRSystemConfig | null
): boolean {
  if (chat?.humanTakeover) {
    return false;
  }

  if (typeof chat?.sdrEnabled === 'boolean') {
    return chat.sdrEnabled;
  }

  return systemConfig?.globalSDREnabled === true;
}
