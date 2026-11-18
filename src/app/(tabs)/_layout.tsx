import { NativeTabs } from 'expo-router/native-tabs';
import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';

import { FloatingHearts } from '@/components/floating-hearts';
import { addDays, today } from '@/lib/dates';
import { useNotificationSetup, useNotificationTaps, useReminders } from '@/lib/notifications';
import { RoomProvider, useRoom } from '@/lib/room';
import { useCouple } from '@/lib/session';
import { specialDays } from '@/lib/special-days';
import { useMilestones } from '@/lib/story';
import { useColors } from '@/lib/theme';
import { useUnreadCount } from '@/lib/unread';

/** Hearts your partner sends float up whichever tab you're on. */
function Hearts({ children }: { children: ReactNode }) {
  const { hearts } = useRoom();
  return (
    <View style={{ flex: 1 }}>
      {children}
      <FloatingHearts burst={hearts} />
    </View>
  );
}

export default function TabsLayout() {
  const ctx = useCouple();
  return (
    <RoomProvider coupleId={ctx?.couple.id} userId={ctx?.userId}>
      <Hearts>
        <Tabs />
      </Hearts>
    </RoomProvider>
  );
}

function Tabs() {
  const c = useColors();
  const ctx = useCouple();
  const together = ctx?.couple.together_since;
  const mine = ctx?.profile.birthday;
  const theirs = ctx?.partner.birthday;
  const name = ctx?.partner.name ?? '';
  const { milestones } = useMilestones(ctx?.couple.id, 'tabs');
  const specials = useMemo(
    () => specialDays(today(), addDays(today(), 60), { togetherSince: together, myBirthday: mine, partnerBirthday: theirs, partnerName: name, story: milestones }),
    [together, mine, theirs, name, milestones],
  );
  useNotificationSetup(ctx?.userId);
  useReminders(ctx?.couple.id, specials);
  useNotificationTaps();
  const unread = useUnreadCount(ctx?.couple.id, ctx?.userId);
  return (
    <NativeTabs
      backgroundColor={c.surface}
      indicatorColor={c.accentSoft}
      badgeBackgroundColor={c.accent}
      badgeTextColor={c.onAccent}
      tintColor={c.accent}
      labelStyle={{ selected: { color: c.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chat">
        <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left', selected: 'bubble.left.fill' }} md="chat_bubble" />
        <NativeTabs.Trigger.Badge hidden={!unread}>{unread > 99 ? '99+' : String(unread)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="together">
        <NativeTabs.Trigger.Label>Together</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'sparkles', selected: 'sparkles' }} md="auto_awesome" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="memories">
        <NativeTabs.Trigger.Label>Memories</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'photo.on.rectangle', selected: 'photo.fill.on.rectangle.fill' }} md="photo_library" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
