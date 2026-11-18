/** One small challenge for each week. Keys are saved when you tick one off, so never change or reuse a key. */
export type Challenge = { key: string; emoji: string; title: string; details: string };

export const CHALLENGES: Challenge[] = [
  { key: 'cook-new', emoji: '🍲', title: 'Cook something new together', details: 'A dish neither of you has made before. Taste as you go.' },
  { key: 'no-phones-walk', emoji: '🚶', title: 'A no-phones walk', details: 'Thirty minutes, phones at home, just the two of you talking.' },
  { key: 'love-notes', emoji: '📝', title: 'Hide three love notes', details: 'Somewhere your partner will find them this week.' },
  { key: 'sunrise', emoji: '🌅', title: 'Watch a sunrise', details: 'Set an alarm, make tea, and watch it together.' },
  { key: 'compliments', emoji: '💐', title: 'A compliment a day', details: 'Seven days, seven real compliments. Say them out loud.' },
  { key: 'new-place', emoji: '🗺️', title: 'Go somewhere new', details: 'A café, a park or a street in Nairobi you have never been to.' },
  { key: 'dance', emoji: '💃', title: 'Dance in the kitchen', details: 'One full song, no matter who is watching.' },
  { key: 'gratitude', emoji: '🙏', title: 'Three things I love about us', details: 'Each of you says three things before bed one night.' },
  { key: 'photo-walk', emoji: '📸', title: 'Take ten photos of each other', details: 'Then pick your favourite and add it to Memories.' },
  { key: 'breakfast', emoji: '🥞', title: 'Breakfast in bed', details: 'Take turns: one of you this week, the other next.' },
  { key: 'playlist', emoji: '🎶', title: 'Make a playlist for each other', details: 'Ten songs each that remind you of the other.' },
  { key: 'stargaze', emoji: '✨', title: 'Stargaze for twenty minutes', details: 'Find a dark spot, lie back and make a wish each.' },
  { key: 'old-photos', emoji: '🖼️', title: 'Look through old photos', details: 'Find one from your first year together and tell the story.' },
  { key: 'massage', emoji: '💆', title: 'Ten-minute massages', details: 'Ten minutes each. Set a timer and no rushing.' },
  { key: 'surprise', emoji: '🎁', title: 'A small surprise', details: 'Something under KSh 500 that made you think of them.' },
  { key: 'question-night', emoji: '💬', title: 'Deep question night', details: 'Open a Talk deck and answer five cards, slowly.' },
  { key: 'plan-trip', emoji: '✈️', title: 'Plan a dream trip', details: 'Where, when and what you would do. Add it to your bucket list.' },
  { key: 'learn-together', emoji: '📚', title: 'Learn something together', details: 'A few words of a new language, a card trick or a recipe.' },
  { key: 'tech-free-dinner', emoji: '🕯️', title: 'A candlelit, phone-free dinner', details: 'Even if it is just chapati and beans.' },
  { key: 'workout', emoji: '🏃', title: 'Work out together', details: 'A run, a dance class or a YouTube workout in the sitting room.' },
  { key: 'thank-you', emoji: '💌', title: 'Write a thank-you letter', details: 'For something they did that you never thanked them for. Try an open-when letter.' },
  { key: 'firsts', emoji: '🥇', title: 'Do a first', details: 'Something neither of you has ever done. Big or tiny.' },
  { key: 'picnic', emoji: '🧺', title: 'Have a picnic', details: 'Karura, the Arboretum or your balcony. Bring a blanket.' },
  { key: 'movie-swap', emoji: '🎬', title: 'Movie swap', details: 'Each picks a favourite film the other has never seen.' },
  { key: 'slow-morning', emoji: '☕', title: 'A slow morning', details: 'No alarms, coffee in bed, nowhere to be until noon.' },
  { key: 'dream-home', emoji: '🏡', title: 'Design your dream home', details: 'Sketch it together. Where does the reading nook go?' },
  { key: 'game-night', emoji: '🎲', title: 'Game night', details: 'Cards, a board game or Would you rather. Loser makes tea.' },
  { key: 'volunteer', emoji: '🤝', title: 'Do something kind together', details: 'Help a neighbour, donate, or volunteer for an afternoon.' },
  { key: 'memory-lane', emoji: '📍', title: 'Visit where you met', details: 'Or as close as you can get. Tell the story from both sides.' },
  { key: 'bucket-tick', emoji: '✅', title: 'Tick something off your bucket list', details: 'Or take the first real step towards one.' },
  { key: 'letters-future', emoji: '⏳', title: 'Letters to the future', details: 'Write to each other a year from now and seal them.' },
  { key: 'bake', emoji: '🧁', title: 'Bake something', details: 'Mandazi, a cake or cookies. Decorate badly on purpose.' },
  { key: 'plant', emoji: '🌱', title: 'Plant something together', details: 'Herbs, flowers or a tiny succulent. Give it a name.' },
  { key: 'hug', emoji: '🤗', title: 'The twenty-second hug', details: 'Every day this week. It is longer than you think.' },
  { key: 'questions-36', emoji: '❓', title: 'Ask five new questions', details: 'Things you have never asked each other before.' },
  { key: 'sunset-drive', emoji: '🚗', title: 'A sunset drive or matatu ride', details: 'Somewhere with a view, music up, windows down.' },
  { key: 'karaoke', emoji: '🎤', title: 'Karaoke duet', details: 'Pick a song, learn the words, perform for each other.' },
  { key: 'spa-night', emoji: '🛁', title: 'Spa night at home', details: 'Face masks, foot soaks and soft music.' },
  { key: 'goals', emoji: '🎯', title: 'Share a goal', details: 'Tell each other one goal for this month and how to help.' },
  { key: 'yes-day', emoji: '👍', title: 'A yes afternoon', details: 'One of you says yes to every reasonable idea the other has.' },
];

/** The Monday of the week a date falls in, at midnight. */
export function weekOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}
