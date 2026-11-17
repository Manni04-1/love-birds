/**
 * Small things to do for your partner, one a day. You and your partner each
 * get a different one, so you're not doing the same thing on the same day.
 */
export const GESTURES: string[] = [
  'Send a voice note saying three things you love about them.',
  'Leave a little note where they\'ll find it later.',
  'Make them a cup of tea or coffee, just the way they like it.',
  'Send them a photo of something that reminded you of them today.',
  'Ask about the best part of their day, and really listen.',
  'Give them a hug that lasts at least 20 seconds.',
  'Tell them something you admire about them, out of nowhere.',
  'Take one small chore off their hands today.',
  'Send a song that makes you think of them.',
  'Plan a tiny surprise for this weekend.',
  'Compliment them in front of someone else.',
  'Write down a favourite memory together and share it with them.',
  'Bring home their favourite snack.',
  'Put your phone away for the whole evening together.',
  'Tell them one thing they did this week that made you proud.',
  'Give them a ten-minute shoulder or foot rub.',
  'Send a good-morning message before they wake up.',
  'Ask what\'s on their mind lately, and don\'t try to fix it.',
  'Recreate a photo from early in your relationship.',
  'Cook or order their favourite meal.',
  'Thank them for something they usually do without being asked.',
  'Hold their hand while you\'re out, just because.',
  'Send them a flirty text in the middle of the day.',
  'Ask them about a dream they have, and how you can help.',
  'Make a playlist of five songs that feel like the two of you.',
  'Write "I love you" somewhere unexpected.',
  'Plan your next date and tell them it\'s on you.',
  'Dance with them in the kitchen, even without music.',
  'Tell them how they make your life better.',
  'Send them a funny meme you know they\'ll love.',
  'Get them a small gift under 500 shillings.',
  'Let them choose the film, and don\'t complain.',
  'Pray for them or wish them well out loud.',
  'Text them "Thinking of you" with no reason at all.',
  'Ask how you can make tomorrow easier for them.',
  'Say sorry for something small you\'ve been meaning to.',
  'Share a childhood story you\'ve never told them.',
  'Kiss them like it\'s the first time.',
  'Make their side of the bed with fresh sheets.',
  'Remind them of a goal they\'re working toward, and cheer them on.',
  'Send a photo of the two of you with a sweet caption.',
  'Tell them which moment today you wished they were with you.',
  'Listen to their favourite song with them, properly.',
  'Do something they love that you usually skip.',
  'Write them a short poem. It can be terrible.',
  'Ask them what made them smile today.',
  'Give them a morning off from everything.',
  'Tell them you\'re proud to be with them.',
];

/** Today's gesture for you. Your partner gets a different one. */
export function gestureFor(dayNumber: number, userId: string, partnerId: string): string {
  const second = userId > partnerId ? 1 : 0;
  const n = GESTURES.length;
  return GESTURES[(((dayNumber * 2 + second) % n) + n) % n];
}
