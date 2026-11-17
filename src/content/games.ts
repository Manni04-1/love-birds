/**
 * Questions for the games. Each question has a fixed key that is saved with
 * your answers, so never change or reuse a key. To reword a question, keep its
 * key. To add one, give it a new key.
 */

export type Level = 'light' | 'deep' | 'flirty' | 'erotic';

/** heat: the "After dark" setting you both need for this level (see Settings). */
export const LEVELS: { level: Level; label: string; emoji: string; blurb: string; heat: 0 | 1 | 2 }[] = [
  { level: 'light', label: 'Light', emoji: '🌤️', blurb: 'Fun and easy, for any day', heat: 0 },
  { level: 'deep', label: 'Deep', emoji: '🌙', blurb: 'Closer, slower and more honest', heat: 0 },
  { level: 'flirty', label: 'Flirty', emoji: '😏', blurb: 'Playful and a little cheeky', heat: 1 },
  { level: 'erotic', label: 'Erotic', emoji: '🔥', blurb: 'Desire, intimacy and what you both want. 18+', heat: 2 },
];

export function levelInfo(level: Level) {
  return LEVELS.find((l) => l.level === level)!;
}

/** The levels you can see: a deck shows only once you've both switched it on. */
export function unlockedLevels(heat: number): Level[] {
  return LEVELS.filter((l) => l.heat <= heat).map((l) => l.level);
}

/* Would you rather -------------------------------------------------------- */

export type WyrQuestion = { key: string; level: Level; a: string; b: string };

const wyr = (level: Level, id: string, a: string, b: string): WyrQuestion => ({ key: `wyr-${id}`, level, a, b });

export const WYR: WyrQuestion[] = [
  wyr('light', 'l01', 'Breakfast in bed every Sunday', 'A surprise dinner date every Friday'),
  wyr('light', 'l02', 'Travel the world together for a year', 'Build your dream home together'),
  wyr('light', 'l03', 'Only be able to whisper', 'Only be able to shout'),
  wyr('light', 'l04', 'A safari in the Maasai Mara', 'A beach holiday in Diani'),
  wyr('light', 'l05', 'Always know what your partner is thinking', 'Always know what your partner is feeling'),
  wyr('light', 'l06', 'Have a dog together', 'Have a cat together'),
  wyr('light', 'l07', 'Cook every meal together', 'Never have to cook again'),
  wyr('light', 'l08', 'Give up music for a year', 'Give up films and series for a year'),
  wyr('light', 'l09', 'Relive your first date', 'Skip ahead to your tenth anniversary for a day'),
  wyr('light', 'l10', 'Win a holiday for two', 'Win a year of free date nights'),
  wyr('light', 'l11', 'Live in the city', 'Live in the countryside'),
  wyr('light', 'l12', 'A picnic on a mountain top', 'Dinner on a boat'),
  wyr('light', 'l13', 'Dance badly together in public', 'Sing karaoke together in public'),
  wyr('light', 'l14', 'A weekend with no phones', 'A weekend with no plans'),
  wyr('light', 'l15', 'Get matching tattoos', 'Wear matching outfits for a whole day'),
  wyr('light', 'l16', 'Be famous together', 'Be secretly rich together'),
  wyr('light', 'l17', 'Always be ten minutes early', 'Always be ten minutes late'),
  wyr('light', 'l18', 'Nyama choma every weekend', 'Pizza every weekend'),
  wyr('light', 'l19', 'Read each other\'s minds for a day', 'Swap bodies for a day'),
  wyr('light', 'l20', 'Celebrate anniversaries with a big party', 'Celebrate anniversaries just the two of you'),
  wyr('light', 'l21', 'Camp under the stars', 'Stay in a luxury hotel'),
  wyr('light', 'l22', 'Get a handwritten love letter', 'Get a surprise gift'),
  wyr('light', 'l23', 'A sunrise date', 'A midnight date'),
  wyr('light', 'l24', 'Watch a horror film together', 'Watch a romcom together'),
  wyr('light', 'l25', 'Plan every trip in detail', 'Book a flight and figure it out there'),

  wyr('deep', 'd01', 'Know exactly how your future together turns out', 'Let it surprise you'),
  wyr('deep', 'd02', 'Hear one hard truth from your partner', 'Never hear it and always wonder'),
  wyr('deep', 'd03', 'Talk a problem through straight away', 'Sleep on it and talk in the morning'),
  wyr('deep', 'd04', 'Be told "I love you" every day', 'Be shown it every day without words'),
  wyr('deep', 'd05', 'A partner who always agrees with you', 'A partner who challenges you'),
  wyr('deep', 'd06', 'Live close to family', 'Live far away and start fresh'),
  wyr('deep', 'd07', 'Relive your happiest day together', 'See one day of your future together'),
  wyr('deep', 'd08', 'Less time together, but every moment counts', 'Lots of ordinary time together'),
  wyr('deep', 'd09', 'A partner who is spontaneous', 'A partner who is reliable'),
  wyr('deep', 'd10', 'Share every password', 'Keep a little privacy each'),
  wyr('deep', 'd11', 'Be comforted with words', 'Be comforted with a hug and silence'),
  wyr('deep', 'd12', 'Reach your biggest dream alone', 'Reach a smaller dream together'),
  wyr('deep', 'd13', 'Know exactly what your partner thinks of you', 'Keep a little mystery'),
  wyr('deep', 'd14', 'Forget your worst argument', 'Always remember what it taught you'),
  wyr('deep', 'd15', 'Grow old in one home', 'Move somewhere new every few years'),

  wyr('flirty', 'f01', 'A slow dance in the kitchen', 'A long kiss in the rain'),
  wyr('flirty', 'f02', 'Get a cheeky text in the middle of work', 'Find a love note in your pocket'),
  wyr('flirty', 'f03', 'Be kissed on the neck', 'Be kissed on the forehead'),
  wyr('flirty', 'f04', 'Cuddle all night', 'Have your own side of the bed'),
  wyr('flirty', 'f05', 'Your partner dressed up to the nines', 'Your partner in sweatpants and a smile'),
  wyr('flirty', 'f06', 'A massage that lasts an hour', 'Kisses that last an hour'),
  wyr('flirty', 'f07', 'Be the big spoon', 'Be the little spoon'),
  wyr('flirty', 'f08', 'Flirt across a crowded room', 'Whisper something cheeky in a crowd'),
  wyr('flirty', 'f09', 'Shower together', 'Bath together'),
  wyr('flirty', 'f10', 'Be seduced', 'Do the seducing'),
  wyr('flirty', 'f11', 'Wake up to kisses', 'Fall asleep to kisses'),
  wyr('flirty', 'f12', 'A voice note saying what they miss about you', 'A photo that makes you blush'),
  wyr('flirty', 'f13', 'Hold hands everywhere', 'Steal kisses when nobody is looking'),
  wyr('flirty', 'f14', 'Your partner cooking for you in just an apron', 'Your partner singing you a love song'),
  wyr('flirty', 'f15', 'A date pretending to be strangers', 'Recreate your first kiss'),

  wyr('erotic', 'e01', 'Slow and sensual', 'Spontaneous and passionate'),
  wyr('erotic', 'e02', 'Lights on', 'Candlelight only'),
  wyr('erotic', 'e03', 'Plan an intimate night in detail', 'Let it happen by surprise'),
  wyr('erotic', 'e04', 'Intimacy first thing in the morning', 'Intimacy late at night'),
  wyr('erotic', 'e05', 'Be blindfolded', 'Do the blindfolding'),
  wyr('erotic', 'e06', 'Be told exactly what your partner wants', 'Be shown'),
  wyr('erotic', 'e07', 'A weekend away with no plans but each other', 'One unforgettable night at home'),
  wyr('erotic', 'e08', 'Try something new together', 'Perfect what you already love'),
  wyr('erotic', 'e09', 'Take the lead', 'Be led'),
  wyr('erotic', 'e10', 'Long, slow build-up', 'Straight to it'),
  wyr('erotic', 'e11', 'Somewhere new in the house', 'The comfort of your own bed'),
  wyr('erotic', 'e12', 'Get a massage that turns into more', 'Give one'),
];

/* How well do you know me ------------------------------------------------- */

/**
 * You answer `self` about yourself, then guess your partner's answer to
 * `other`, where {name} is your partner's name.
 */
export type QuizQuestion = { key: string; level: Level; self: string; other: string; options: string[] };

const quiz = (level: Level, id: string, self: string, other: string, options: string[]): QuizQuestion => ({
  key: `quiz-${id}`,
  level,
  self,
  other,
  options,
});

export const QUIZ: QuizQuestion[] = [
  quiz('light', 'l01', 'Your perfect Saturday?', '{name}\'s perfect Saturday?', ['Out with friends', 'Sleeping in and doing nothing', 'An adventure somewhere new', 'A cosy day at home']),
  quiz('light', 'l02', 'Your go-to comfort food?', '{name}\'s go-to comfort food?', ['Chips', 'Something sweet', 'A home-cooked meal', 'Pizza or burgers']),
  quiz('light', 'l03', 'Morning person or night owl?', 'Is {name} a morning person or a night owl?', ['Morning person', 'Night owl', 'Neither, always tired', 'Depends on the day']),
  quiz('light', 'l04', 'Your dream holiday?', '{name}\'s dream holiday?', ['Beach and sunshine', 'A big city abroad', 'Safari and nature', 'Mountains and cool air']),
  quiz('light', 'l05', 'The first thing you do when you wake up?', 'The first thing {name} does on waking up?', ['Check the phone', 'Snooze the alarm', 'Shower', 'Tea or coffee']),
  quiz('light', 'l06', 'How do you most like to be shown love?', 'How does {name} most like to be shown love?', ['Kind words', 'Quality time', 'Hugs and touch', 'Thoughtful gifts', 'Help with things']),
  quiz('light', 'l07', 'Your pick for movie night?', '{name}\'s pick for movie night?', ['Action', 'Comedy', 'Romance', 'Horror or thriller']),
  quiz('light', 'l08', 'How do you take your tea or coffee?', 'How does {name} take their tea or coffee?', ['Strong and black', 'Lots of milk', 'Sweet, with sugar', 'Doesn\'t drink it']),
  quiz('light', 'l09', 'Your biggest pet peeve?', '{name}\'s biggest pet peeve?', ['People who are late', 'Loud chewing', 'Bad drivers', 'Slow replies']),
  quiz('light', 'l10', 'Which superpower would you choose?', 'Which superpower would {name} choose?', ['Flying', 'Invisibility', 'Teleporting', 'Reading minds']),
  quiz('light', 'l11', 'Your ideal date?', '{name}\'s ideal date?', ['A fancy dinner', 'Something active', 'A movie night in', 'A long walk and talk']),
  quiz('light', 'l12', 'Your favourite kind of weather?', '{name}\'s favourite kind of weather?', ['Hot and sunny', 'Rainy and cosy', 'Cool and fresh', 'Doesn\'t mind']),
  quiz('light', 'l13', 'When you\'re stressed, you…', 'When {name} is stressed, they…', ['Want to talk it out', 'Need space', 'Eat', 'Sleep it off']),
  quiz('light', 'l14', 'What would you save first in a fire (people and pets are safe)?', 'What would {name} save first in a fire?', ['Phone', 'Photos', 'Laptop', 'Wallet and documents']),
  quiz('light', 'l15', 'Your favourite part of the weekend?', '{name}\'s favourite part of the weekend?', ['Sleeping in', 'Rest and quiet time', 'Going out', 'Time with family']),
  quiz('light', 'l16', 'Your karaoke pick?', '{name}\'s karaoke pick?', ['Afrobeats or Bongo', 'R&B love songs', 'Pop hits', 'Would never sing']),

  quiz('deep', 'd01', 'What makes you feel most loved?', 'What makes {name} feel most loved?', ['Hearing "I love you"', 'Undivided attention', 'Being held', 'Being looked after']),
  quiz('deep', 'd02', 'After an argument, you need…', 'After an argument, {name} needs…', ['To talk it through now', 'Some time alone first', 'A hug before words', 'An apology']),
  quiz('deep', 'd03', 'Your biggest fear in life?', '{name}\'s biggest fear in life?', ['Failing', 'Being alone', 'Losing family', 'Wasting time']),
  quiz('deep', 'd04', 'In five years, you most want to be…', 'In five years, {name} most wants to be…', ['Growing a career', 'Growing a family', 'Travelling', 'Running a business']),
  quiz('deep', 'd05', 'What matters most to you in a relationship?', 'What matters most to {name} in a relationship?', ['Trust', 'Fun', 'Communication', 'Loyalty', 'Respect']),
  quiz('deep', 'd06', 'When you\'re sad, you want…', 'When {name} is sad, they want…', ['A listening ear', 'Something to laugh about', 'Time alone', 'Help fixing the problem']),
  quiz('deep', 'd07', 'What would you rather be known for?', 'What would {name} rather be known for?', ['Kindness', 'Success', 'Humour', 'Wisdom']),
  quiz('deep', 'd08', 'Big birthday celebrations?', 'How does {name} feel about big birthday celebrations?', ['Love them', 'Something small please', 'Rather forget birthdays', 'Just the two of us']),
  quiz('deep', 'd09', 'How do you handle money?', 'How does {name} handle money?', ['Saver', 'Spender', 'Planner with a budget', 'Somewhere in between']),
  quiz('deep', 'd10', 'What recharges you most?', 'What recharges {name} most?', ['Time alone', 'Time with friends', 'Time in nature', 'Time with you']),

  quiz('flirty', 'f01', 'Where do you most like to be kissed?', 'Where does {name} most like to be kissed?', ['Lips', 'Neck', 'Forehead', 'Hands']),
  quiz('flirty', 'f02', 'What catches your eye first?', 'What catches {name}\'s eye first?', ['Eyes', 'Smile', 'Outfit', 'Scent']),
  quiz('flirty', 'f03', 'Your favourite way to flirt?', '{name}\'s favourite way to flirt?', ['Teasing', 'Compliments', 'A look across the room', 'Cheeky texts']),
  quiz('flirty', 'f04', 'Best time for cuddles?', '{name}\'s favourite time for cuddles?', ['First thing in the morning', 'On the sofa after work', 'Falling asleep', 'Any time']),
  quiz('flirty', 'f05', 'What would make you blush most?', 'What would make {name} blush most?', ['A compliment in public', 'A cheeky text at work', 'A long stare', 'A slow dance']),
  quiz('flirty', 'f06', 'Your idea of a romantic night in?', '{name}\'s idea of a romantic night in?', ['Candles and dinner', 'Bath and massage', 'Dancing in the living room', 'A film and cuddles']),
  quiz('flirty', 'f07', 'Which kiss is best?', 'Which kiss does {name} like best?', ['A quick peck', 'A slow, long kiss', 'A surprise kiss', 'A goodnight kiss']),
  quiz('flirty', 'f08', 'Which scent gets you?', 'Which scent gets {name}?', ['Fresh out of the shower', 'Perfume or cologne', 'Coconut or vanilla', 'Just your natural scent']),

  quiz('erotic', 'e01', 'Your favourite time for intimacy?', '{name}\'s favourite time for intimacy?', ['Morning', 'Afternoon', 'Late at night', 'Whenever the mood hits']),
  quiz('erotic', 'e02', 'What sets the mood best for you?', 'What sets the mood best for {name}?', ['Candles and music', 'Words and teasing', 'A massage', 'A long kiss']),
  quiz('erotic', 'e03', 'What would you most like to try?', 'What would {name} most like to try?', ['Somewhere new', 'Role play', 'A blindfold', 'Taking it extra slow']),
  quiz('erotic', 'e04', 'Lead or be led?', 'Does {name} prefer to lead or be led?', ['Lead', 'Be led', 'Take turns', 'Depends on the mood']),
  quiz('erotic', 'e05', 'How do you most like to hear you\'re wanted?', 'How does {name} most like to hear they\'re wanted?', ['Whispered words', 'A text during the day', 'A look', 'Being pulled close']),
  quiz('erotic', 'e06', 'Lights?', '{name}\'s choice of lights?', ['On', 'Off', 'Candles', 'Doesn\'t mind']),
];

/* Talk decks -------------------------------------------------------------- */

export const TALK: Record<Level, string[]> = {
  light: [
    'What was your first impression of me?',
    'What\'s the best meal we\'ve had together?',
    'Which song would play in the film of our love story?',
    'What\'s a small thing I do that always makes you smile?',
    'If we opened a business together, what would it be?',
    'What\'s the most fun day we\'ve had so far?',
    'Which famous couple are we most like?',
    'What would our reality show be called?',
    'What\'s one trip we have to take together?',
    'What did you want to be when you were little?',
    'What\'s your favourite photo of us, and why?',
    'If we could live anywhere for a year, where would it be?',
    'What\'s a skill you\'d love us to learn together?',
    'What\'s the silliest argument we\'ve ever had?',
    'What three words would your friends use to describe us?',
    'What\'s something you\'ve never tried but want to try with me?',
    'What tiny tradition should we start?',
    'What\'s the best gift you\'ve ever been given?',
    'What\'s your guilty-pleasure song?',
    'What did you think the first time we texted?',
  ],
  deep: [
    'When did you first know you loved me?',
    'What\'s something you\'ve never told me?',
    'What do you need more of from me right now?',
    'What\'s a moment you felt really proud of us?',
    'How has being with me changed you?',
    'What\'s a fear you have about our future?',
    'What does a happy life look like to you in ten years?',
    'What hard time did we get through that made us stronger?',
    'When do you feel most understood by me?',
    'What do you wish I asked you about more often?',
    'What did love look like in the home you grew up in?',
    'What\'s one thing you\'d change about how we argue?',
    'Is there a dream you gave up on that you\'d like to pick back up?',
    'What does trust mean to you?',
    'How do you want to be supported when things go wrong?',
    'What\'s something about yourself you\'re still learning to accept?',
    'What\'s one promise you\'d like us to make to each other?',
    'What are you most grateful for in your life right now?',
    'What do you want us to be like when we\'re old?',
    'What\'s a memory with me you\'ll never forget?',
  ],
  flirty: [
    'What did you first find attractive about me?',
    'Which outfit of mine do you like most?',
    'Where\'s the most memorable place we\'ve kissed?',
    'What\'s something I do that you find really attractive?',
    'Describe the perfect kiss.',
    'What\'s the cheekiest thought you\'ve had about me today?',
    'Which part of a date do you look forward to most?',
    'What\'s a compliment you\'d like to hear more often?',
    'If tonight were the perfect date night, how would it go?',
    'When do I look my best to you?',
    'Which romantic film scene would you like us to recreate?',
    'What\'s your favourite way to wake me up?',
    'What\'s the most romantic thing I\'ve done for you?',
    'Which text from me made you blush?',
    'If we spent a whole day in bed, what would we do apart from sleep?',
    'Which song makes you think of me in a flirty way?',
    'Where would you love to be kissed right now?',
    'What\'s one thing you\'d love me to whisper to you?',
    'Which of my features is your favourite?',
    'What\'s something new you\'d like to try on a date night?',
  ],
  erotic: [
    'What makes you feel most desired by me?',
    'Is there a fantasy you\'ve thought about but never shared?',
    'What helps you get in the mood, and what kills the mood?',
    'What would you like more of in our intimate life?',
    'What\'s your favourite memory of us being intimate?',
    'Is there something new you\'d like us to try? What would make it feel safe?',
    'How do you like me to let you know I want you?',
    'What words do you love hearing in the moment?',
    'What\'s a boundary you want me to always respect?',
    'How can you tell me you want to slow down or stop, so it\'s easy to say?',
    'When do you feel the most desire: morning, afternoon or night?',
    'What\'s one thing I do that drives you wild?',
    'How can we make "not tonight" easy to say without anyone feeling hurt?',
    'What\'s something you were shy to talk about at first but feel ready to now?',
    'How much does romance during the day help you feel in the mood at night?',
    'Is there a place, other than our bed, you\'ve imagined us?',
    'How do you feel about trying a toy, a game or role play together?',
    'What would your perfect intimate evening look like, from start to finish?',
    'How would you like us to check in with each other afterwards?',
    'What helps you feel safe and close enough to let go?',
  ],
};
