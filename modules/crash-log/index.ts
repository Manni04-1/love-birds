import { requireOptionalNativeModule } from 'expo';

export type AppExit = { time: number; reason: string; description: string | null; importance: number; trace: string | null };

type CrashLogNative = {
  install(): void;
  takeLastCrash(): Promise<string | null>;
  exitsSince(since: number): Promise<AppExit[]>;
};

/** Null on the web, on iPhone, and on app versions before 1.5.0 (an update can reach those). */
export const CrashLog = requireOptionalNativeModule<CrashLogNative>('CrashLog');
