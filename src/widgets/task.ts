import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { supabase } from '@/lib/supabase';
import { fetchWidgetData, readNudge, readWidgetData, within, writeNudge, writeWidgetData } from '@/widgets/data';
import { drawWidget } from '@/widgets/widgets';

// Android gives the task 30 seconds, so the network gets less than half of that.
const PATIENCE = 12_000;

let sending = false;

/**
 * Runs in the background whenever Android asks a widget to draw (when it's added, resized and
 * every half hour) and when someone taps "Thinking of you". Draws what the phone already knows
 * straight away, then looks for anything newer.
 */
export async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED') return;
  const name = widgetInfo.widgetName;
  let data = await readWidgetData();
  let nudge = await readNudge();
  const show = (busy = false) => renderWidget(drawWidget(name, widgetInfo, data, nudge, new Date(), busy));

  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'NUDGE') {
    // A second tap while the first is on its way does nothing.
    if (sending) return;
    if (!data) return show();
    sending = true;
    try {
      show(true);
      const ok = await within(supabase.rpc('send_nudge'), PATIENCE).then(
        ({ error }) => !error,
        () => false,
      );
      nudge = { at: new Date().toISOString(), ok };
      await writeNudge(nudge);
    } finally {
      sending = false;
    }
    return show();
  }

  // A widget that has never drawn stays blank for the moment it takes to look things up.
  if (data) show();
  try {
    data = await within(fetchWidgetData(), PATIENCE);
  } catch {
    // No connection: keep what's showing, or say where to look if there's nothing yet.
    if (!data) show();
    return;
  }
  await writeWidgetData(data);
  show();
}
