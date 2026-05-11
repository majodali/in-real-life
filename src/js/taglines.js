// Hero taglines for the landing page.
//
// One is picked at random per page load. Each entry has an `active` flag —
// inactive ones live in the file (so we don't lose ideas) but won't be
// shown until promoted. The /taglines.html review page shows everything,
// active and not, grouped by category.

export const TAGLINES = [
  // ─── Mr. Rogers / Sesame Street register ───
  { category: 'rogers', text: 'Who are the people in your neighborhood?', active: true },
  { category: 'rogers', text: "It's a beautiful day in the neighborhood.", active: true },
  { category: 'rogers', text: "Won't you be my neighbor?", active: true },
  { category: 'rogers', text: 'Howdy, neighbor.', active: true },

  // ─── Quietly direct ───
  { category: 'direct', text: 'The world needs you.', active: true },
  { category: 'direct', text: 'You are wanted here.', active: true },
  { category: 'direct', text: "Someone is hoping you'll show up.", active: true },
  { category: 'direct', text: 'We saved you a seat.', active: true },
  { category: 'direct', text: "We've been expecting you.", active: true },

  // ─── Literary / borrowed ───
  { category: 'literary', text: 'Only connect.', attribution: 'E. M. Forster', active: true },
  { category: 'literary', text: 'All real living is meeting.', attribution: 'Martin Buber', active: true },
  { category: 'literary', text: 'To be of use.', attribution: 'Marge Piercy', active: true },
  { category: 'literary', text: 'Good fences make good neighbors.', attribution: 'Robert Frost', active: true },
  { category: 'literary', text: 'No man is an island.', attribution: 'John Donne', active: true },
  { category: 'literary', text: 'Practice resurrection.', attribution: 'Wendell Berry', active: true },
  { category: 'literary', text: 'Pay attention. Be astonished. Tell about it.', attribution: 'Mary Oliver', active: true },
  { category: 'literary', text: 'The only way to have a friend is to be one.', attribution: 'Ralph Waldo Emerson', active: true },
  { category: 'literary', text: 'Live the questions now.', attribution: 'Rainer Maria Rilke', active: true },
  { category: 'literary', text: 'Friendship is born at that moment when one person says to another: "What! You too?"', attribution: 'C. S. Lewis', active: true },
  { category: 'literary', text: 'To love at all is to be vulnerable.', attribution: 'C. S. Lewis', active: true },
  { category: 'literary', text: 'What you seek is seeking you.', attribution: 'Rumi', active: true },
  { category: 'literary', text: 'The bird a nest, the spider a web, man friendship.', attribution: 'William Blake', active: true },
  { category: 'literary', text: 'Two are better than one.', attribution: 'Ecclesiastes 4:9', active: true },
  { category: 'literary', text: 'Wherever there is a human being, there is an opportunity for kindness.', attribution: 'Seneca', active: true },
  { category: 'literary', text: 'Home is the place where, when you have to go there, they have to take you in.', attribution: 'Robert Frost', active: true },
  { category: 'literary', text: 'It is a pleasure when friends visit from afar.', attribution: 'Confucius', active: true },
  { category: 'literary', text: 'The world is one family.', attribution: 'Maha Upanishad', active: true },
  { category: 'literary', text: 'The children of Adam are limbs of one body.', attribution: 'Saadi', active: true },
  { category: 'literary', text: 'A person is a person through other people.', attribution: 'Ubuntu, Southern Africa', active: true },
  { category: 'literary', text: 'If you want to go fast, go alone. If you want to go far, go together.', attribution: 'African proverb', active: true },
  { category: 'literary', text: 'Your friend is your needs answered.', attribution: 'Kahlil Gibran', active: true },
  { category: 'literary', text: 'Many small people, in small places, doing small things, can change the world.', attribution: 'Eduardo Galeano', active: true },
  { category: 'literary', text: 'One time, one meeting.', attribution: 'Japanese, ichigo ichie', active: true },

  // ─── Time, place, ritual ───
  { category: 'ritual', text: 'Saturday morning. Coffee. People.', active: true },
  { category: 'ritual', text: 'Tuesday is for walking.', active: true },
  { category: 'ritual', text: "The kettle's on.", active: true },
  { category: 'ritual', text: 'Pull up a chair.', active: true },
  { category: 'ritual', text: "Tea's on.", active: true },

  // ─── Anti-platform ───
  { category: 'anti-platform', text: 'Most apps want your attention. We want your Saturday afternoon.', active: true },
  { category: 'anti-platform', text: 'The notification worth getting is a knock at the door.', active: true },
  { category: 'anti-platform', text: "You weren't meant to scroll alone.", active: true },
  { category: 'anti-platform', text: 'Hello is harder than it should be.', active: true },

  // ─── Question / invitation ───
  { category: 'question', text: 'What if you knew your neighbors?', active: true },
  { category: 'question', text: 'When did you last meet someone new?', active: true },
];

export const CATEGORY_LABELS = {
  rogers: 'Mr. Rogers / Sesame Street register',
  direct: 'Quietly direct',
  literary: 'Literary / borrowed',
  ritual: 'Time, place, ritual',
  'anti-platform': 'Anti-platform',
  question: 'Question / invitation',
};

const FALLBACK = { text: 'Show up.', active: true };

export function pickActiveTagline({ taglines = TAGLINES, random = Math.random } = {}) {
  const active = taglines.filter(t => t.active);
  if (active.length === 0) return FALLBACK;
  return active[Math.floor(random() * active.length)];
}
