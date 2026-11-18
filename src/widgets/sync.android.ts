import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getWidgetInfo, requestPinWidget, requestWidgetUpdate } from 'react-native-android-widget';

import { fetchWidgetData, readNudge, WIDGETS, within, writeNudge, writeWidgetData, type WidgetData, type WidgetName } from '@/widgets/data';
import { drawWidget } from '@/widgets/widgets';

let last = 0;
let running: Promise<void> | null = null;
let again = false;

/** True when at least one Love Birds widget is on the home screen. */
async function anyPlaced(): Promise<boolean> {
  const lists = await Promise.all(WIDGETS.map((name) => getWidgetInfo(name).catch(() => [])));
  return lists.some((list) => list.length > 0);
}

async function redraw(data: WidgetData | null) {
  const nudge = await readNudge();
  await Promise.all(
    WIDGETS.map((name) => requestWidgetUpdate({ widgetName: name, renderWidget: (info) => drawWidget(name, info, data, nudge, new Date()) })),
  );
}

/**
 * Brings the widgets on the home screen up to date. At most once a minute unless `now`, and it
 * does nothing when there are no widgets to update.
 */
export function refreshWidgets(now = false): Promise<void> {
  if (running) {
    if (now) again = true;
    return running;
  }
  if (!now && Date.now() - last < 60_000) return Promise.resolve();
  running = (async () => {
    try {
      if (!(await anyPlaced())) return;
      const data = await within(fetchWidgetData(), 15_000);
      await writeWidgetData(data);
      last = Date.now();
      await redraw(data);
    } catch {
      // No connection: the widgets keep what they show.
    } finally {
      running = null;
      if (again) {
        again = false;
        refreshWidgets(true);
      }
    }
  })();
  return running;
}

/** Empties the widgets when you sign out, so they don't keep showing your names. */
export async function clearWidgets() {
  last = 0;
  await writeWidgetData(null);
  await writeNudge(null);
  await redraw(null).catch(() => {});
}

/** Asks the home screen to add a widget. False when it can't, so the person can add it by hand. */
export async function pinWidget(name: WidgetName): Promise<boolean> {
  try {
    return await requestPinWidget({ widgetName: name });
  } catch {
    return false;
  }
}

/**
 * Keeps the widgets in step with the app: when it opens, when `key` changes (a new theme, name
 * or date) and each time you leave the app.
 */
export function useWidgetSync(key: string | null) {
  useEffect(() => {
    if (!key) return;
    refreshWidgets(true);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') refreshWidgets(true);
    });
    return () => sub.remove();
  }, [key]);
}
