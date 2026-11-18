'use no memo';
// The home-screen widgets. react-native-android-widget calls these functions directly (no hooks)
// and turns what they return into a picture, so the React Compiler has to leave this file alone.

import { FlexWidget, TextWidget, type ColorProp, type WidgetInfo, type WidgetRepresentation } from 'react-native-android-widget';

import { animalEmoji } from '@/content/animals';
import { clockLabel, daysBetween, parseISODate, timeLabel, toISODate } from '@/lib/dates';
import type { NudgeState, WidgetData } from '@/widgets/data';

type Look = { from: ColorProp; to: ColorProp; ink: ColorProp; soft: ColorProp; chip: ColorProp; shadow: ColorProp };

const ON_DARK = { ink: '#FFFFFF', soft: 'rgba(255, 255, 255, 0.86)', chip: 'rgba(255, 255, 255, 0.2)', shadow: 'rgba(0, 0, 0, 0.3)' } as const;
const ON_LIGHT = { ink: '#0F2A2E', soft: 'rgba(15, 42, 46, 0.78)', chip: 'rgba(255, 255, 255, 0.6)', shadow: 'rgba(255, 255, 255, 0.5)' } as const;

/** Each theme's sky from the picture at the top of Home, so a widget matches the app. */
const LOOKS: Record<string, { light: Look; dark: Look }> = {
  rose: { light: { from: '#FF8FB1', to: '#D3325F', ...ON_DARK }, dark: { from: '#6E1C3F', to: '#2A0A16', ...ON_DARK } },
  steampunk: { light: { from: '#8A5A2B', to: '#3D2614', ...ON_DARK }, dark: { from: '#3B2614', to: '#140C06', ...ON_DARK } },
  meadow: { light: { from: '#9ED9FF', to: '#E6F7FF', ...ON_LIGHT }, dark: { from: '#0E2238', to: '#1C3D33', ...ON_DARK } },
  serengeti: { light: { from: '#FF9F4A', to: '#C8452F', ...ON_DARK }, dark: { from: '#3B1E3A', to: '#1B0F05', ...ON_DARK } },
  diani: { light: { from: '#7FD3F2', to: '#D9F5FC', ...ON_LIGHT }, dark: { from: '#0A1F3B', to: '#12405A', ...ON_DARK } },
  starry: { light: { from: '#6A5BD0', to: '#2B2470', ...ON_DARK }, dark: { from: '#1C1C52', to: '#0B0B22', ...ON_DARK } },
};

// Fonts copied into the app by the widget plugin in app.json, found by file name.
const HEADING = 'BricolageGrotesque_800ExtraBold';
const BODY = 'NunitoSans_700Bold';

type Plan = WidgetData['plans'][number];

const daysFrom = (from: string, to: string) => daysBetween(parseISODate(from), parseISODate(to));

/** The next time a plan comes round that hasn't finished by `day`. */
export function nextPlan(data: WidgetData, day: string): Plan | null {
  return data.plans.find((p) => p.end >= day) ?? null;
}

/** "On now", "Today at 7:30 PM", "Tomorrow" or "In 5 days". */
export function whenLabel(p: Plan, day: string): string {
  if (p.start < day) return 'On now';
  const n = daysFrom(day, p.start);
  if (n === 0) return p.time ? `Today at ${timeLabel(p.time)}` : 'Today';
  if (n === 1) return p.time ? `Tomorrow at ${timeLabel(p.time)}` : 'Tomorrow';
  return `In ${n} days`;
}

/** "Zuri feels 🥰 Missing you", or that they haven't shared a mood today. */
export function moodLabel(data: WidgetData, day: string): string {
  const m = data.mood?.day === day ? data.mood : null;
  if (!m) return `${data.partner} hasn't shared a mood today`;
  if (data.hidden || !m.word) return `${data.partner} feels ${m.emoji}`;
  return `${data.partner} feels ${m.emoji} ${m.word}`;
}

export function planLabel(data: WidgetData, day: string): string {
  const p = nextPlan(data, day);
  if (!p) return 'Nothing planned yet';
  return data.hidden ? `Next plan: ${whenLabel(p, day).toLowerCase()}` : `${p.title} · ${whenLabel(p, day)}`;
}

function Frame({ look, children, label, click, uri, padding = 16 }: { look: Look; children: unknown; label: string; click: string; uri?: string; padding?: number }) {
  return (
    <FlexWidget
      clickAction={click}
      clickActionData={uri ? { uri } : undefined}
      accessibilityLabel={label}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundGradient: { from: look.from, to: look.to, orientation: 'TL_BR' },
        borderRadius: 24,
        padding,
        flexDirection: 'column',
      }}>
      {children}
    </FlexWidget>
  );
}

function Line({ text, look, size = 12, color, font = BODY, center }: { text: string; look: Look; size?: number; color?: ColorProp; font?: string; center?: boolean }) {
  return (
    <TextWidget
      text={text}
      maxLines={1}
      truncate="END"
      style={{ fontSize: size, fontFamily: font, color: color ?? look.soft, textAlign: center ? 'center' : 'left', textShadowColor: look.shadow, textShadowRadius: 4 }}
    />
  );
}

function Chip({ text, look }: { text: string; look: Look }) {
  return (
    <FlexWidget style={{ width: 'match_parent', backgroundColor: look.chip, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
      <TextWidget text={text} maxLines={1} truncate="END" style={{ fontSize: 12, fontFamily: BODY, color: look.ink }} />
    </FlexWidget>
  );
}

function SetUp({ look, what }: { look: Look; what: string }) {
  return (
    <Frame look={look} label="Open Love Birds" click="OPEN_APP">
      <FlexWidget style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', flexGap: 4 }}>
        <TextWidget text="💕" style={{ fontSize: 28 }} />
        <TextWidget text={what} maxLines={2} truncate="END" style={{ fontSize: 13, fontFamily: BODY, color: look.ink, textAlign: 'center' }} />
      </FlexWidget>
    </Frame>
  );
}

/** Love Birds (4×2): your two animals, days together, how your partner feels and what's next. */
function Together({ data, day, look, height }: { data: WidgetData; day: string; look: Look; height: number }) {
  const together = data.together && data.together <= day ? daysFrom(data.together, day) : null;
  const roomy = height >= 140;
  return (
    <Frame look={look} label={`Love Birds. ${moodLabel(data, day)}. ${planLabel(data, day)}`} click="OPEN_APP" padding={roomy ? 16 : 12}>
      {/* The names take the room that's left, which keeps the count at the right-hand edge. */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <TextWidget text={`${animalEmoji(data.myAnimal) ?? '🦜'} 💕 ${animalEmoji(data.partnerAnimal) ?? '🦜'}`} style={{ fontSize: roomy ? 26 : 22 }} />
          <Line text={`${data.me} & ${data.partner}`} look={look} size={13} />
        </FlexWidget>
        {together !== null ? (
          <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
            <TextWidget text={together.toLocaleString('en-GB')} style={{ fontSize: roomy ? 36 : 30, fontFamily: HEADING, color: look.ink, textShadowColor: look.shadow, textShadowRadius: 6 }} />
            <Line text={together === 1 ? 'day together' : 'days together'} look={look} size={11} />
          </FlexWidget>
        ) : null}
      </FlexWidget>
      <FlexWidget style={{ flex: 1, width: 'match_parent' }} />
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', flexGap: 5 }}>
        {roomy ? <Chip text={moodLabel(data, day)} look={look} /> : null}
        <Chip text={`📅 ${planLabel(data, day)}`} look={look} />
      </FlexWidget>
    </Frame>
  );
}

/** Countdown (2×2): days to go until the next plan, or your days together when nothing's planned. */
function Countdown({ data, day, look, width, height }: { data: WidgetData; day: string; look: Look; width: number; height: number }) {
  // Squeezed smaller than two by two, it drops the heading and keeps the plan to one line.
  const small = width < 150 || height < 150;
  const p = nextPlan(data, day);
  if (!p) {
    const together = data.together && data.together <= day ? daysFrom(data.together, day) : null;
    return (
      <Frame look={look} label="Nothing planned yet. Tap to plan something." click="OPEN_URI" uri="lovebirds:///calendar" padding={12}>
        <FlexWidget style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', flexGap: 2 }}>
          {small ? null : <Line text={together !== null ? 'TOGETHER' : 'NEXT PLAN'} look={look} size={10} center />}
          <TextWidget
            text={together !== null ? together.toLocaleString('en-GB') : '💕'}
            maxLines={1}
            style={{ fontSize: small ? 30 : 40, fontFamily: HEADING, color: look.ink, textAlign: 'center' }}
          />
          <Line text={together !== null ? 'days together' : 'Nothing planned'} look={look} size={12} center />
          <Line text="Tap to plan something" look={look} size={11} center />
        </FlexWidget>
      </Frame>
    );
  }
  const n = daysFrom(day, p.start);
  const big = p.start < day ? 'On now' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : String(n);
  const sub = n > 1 ? 'days to go' : p.time && n >= 0 ? timeLabel(p.time) : '';
  const title = data.hidden ? 'Your next plan' : p.title;
  const size = big.length > 3 ? (small ? 22 : 26) : small ? 36 : 48;
  return (
    <Frame look={look} label={`${title}, ${whenLabel(p, day)}`} click="OPEN_URI" uri={`lovebirds:///calendar?day=${p.start < day ? day : p.start}`} padding={12}>
      <FlexWidget style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', flexGap: small ? 0 : 2 }}>
        {small ? null : <Line text="NEXT PLAN" look={look} size={10} center />}
        <TextWidget
          text={big}
          maxLines={1}
          style={{ fontSize: size, fontFamily: HEADING, color: look.ink, textAlign: 'center', textShadowColor: look.shadow, textShadowRadius: 6 }}
        />
        {sub ? <Line text={sub} look={look} size={small ? 11 : 12} center /> : null}
        <TextWidget text={title} maxLines={small ? 1 : 2} truncate="END" style={{ fontSize: small ? 12 : 13, fontFamily: BODY, color: look.ink, textAlign: 'center' }} />
      </FlexWidget>
    </Frame>
  );
}

/** Thinking of you (2×1): one tap sends your partner a "Thinking of you", just like on Home. */
function Thinking({ data, look, nudge, sending, day, width, height }: { data: WidgetData; look: Look; nudge: NudgeState; sending: boolean; day: string; width: number; height: number }) {
  const recent = nudge && toISODate(new Date(nudge.at)) === day ? nudge : null;
  const narrow = width < 220;
  const status = sending
    ? 'Sending…'
    : recent?.ok
      ? narrow
        ? `Sent at ${clockLabel(recent.at)} 💕`
        : `Sent to ${data.partner} at ${clockLabel(recent.at)} 💕`
      : recent
        ? narrow
          ? 'Tap to try again'
          : "Couldn't send it. Tap to try again"
        : `Tap to tell ${data.partner}`;
  const label = `Thinking of you. ${status}`;
  if (height >= 120) {
    // Two rows tall or more: a big thought bubble in the middle.
    return (
      <Frame look={look} label={label} click="NUDGE" padding={12}>
        <FlexWidget style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', flexGap: 4 }}>
          <TextWidget text="💭" style={{ fontSize: 40 }} />
          <Line text="Thinking of you" look={look} size={17} color={look.ink} font={HEADING} center />
          <TextWidget text={status} maxLines={2} truncate="END" style={{ fontSize: 12, fontFamily: BODY, color: look.soft, textAlign: 'center' }} />
        </FlexWidget>
      </Frame>
    );
  }
  return (
    <Frame look={look} label={label} click="NUDGE" padding={narrow ? 10 : 12}>
      <FlexWidget style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: narrow ? 6 : 10 }}>
        {width < 150 ? null : <TextWidget text="💭" style={{ fontSize: narrow ? 22 : 28 }} />}
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <Line text="Thinking of you" look={look} size={narrow ? 14 : 16} color={look.ink} font={HEADING} />
          <Line text={status} look={look} size={narrow ? 11 : 12} />
        </FlexWidget>
      </FlexWidget>
    </Frame>
  );
}

type Size = Pick<WidgetInfo, 'width' | 'height'>;

function draw(name: string, info: Size, data: WidgetData | null, nudge: NudgeState, sending: boolean, day: string, look: Look) {
  if (!data) return <SetUp look={look} what="Open Love Birds and sign in to see you two here" />;
  if (name === 'Countdown') return <Countdown data={data} day={day} look={look} width={info.width} height={info.height} />;
  if (name === 'ThinkingOfYou') return <Thinking data={data} look={look} nudge={nudge} sending={sending} day={day} width={info.width} height={info.height} />;
  return <Together data={data} day={day} look={look} height={info.height} />;
}

/** The widget called `name`, drawn for light and dark mode. `now` is passed in so drawing stays pure. */
export function drawWidget(name: string, info: Size, data: WidgetData | null, nudge: NudgeState, now: Date, sending = false): WidgetRepresentation {
  const looks = LOOKS[data?.theme ?? 'rose'] ?? LOOKS.rose;
  const day = toISODate(now);
  return { light: draw(name, info, data, nudge, sending, day, looks.light), dark: draw(name, info, data, nudge, sending, day, looks.dark) };
}
