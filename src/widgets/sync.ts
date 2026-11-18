// Home-screen widgets are Android only (see sync.android.ts). Elsewhere these do nothing.
import type { WidgetName } from '@/widgets/data';

export async function refreshWidgets(_now = false) {}

export async function clearWidgets() {}

export async function pinWidget(_name: WidgetName): Promise<boolean> {
  return false;
}

export function useWidgetSync(_key: string | null) {}
