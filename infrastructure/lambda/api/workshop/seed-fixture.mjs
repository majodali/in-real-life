// The workshop seed catalog (D64 slice 2, docs/admin-and-support.md → §2
// Workshop): ~50 personas and ~50 events, generated deterministically
// from compact pools — archetypes × names for people, templates × slots
// for events — so the whole catalog stays cheap to reshape.
//
// STRAWMAN CONTENTS — same posture as the locality and event-type
// registers: a first pass written to be corrected by facilitation
// experience, never deferred to. Structure over polish.
//
// Symbolic locality slots (decided at review): personas and events
// reference slots `A` (the workshop's home), `B` (a neighbor), `C` (a
// crossing) — bound to real register localities at persona-seed time.
// Running the same workshop in a different community is a different
// binding, never a fixture edit.
//
// These are workshop-only accounts. The shared password below is public
// test data BY CONSTRUCTION (it renders in the operator console) — it
// exists so a facilitator can "open as" any persona, and must never be
// the pattern for a real member credential.

import { COMMUNITY } from '../lib/localities.mjs';

export const SEED_PASSWORD = 'Workshop-irl-1!';

export function personaEmail(personaId) {
  return `seed-${personaId}@workshop.in-real.life`;
}

export const SEED_SLOTS = ['A', 'B', 'C'];

export const DEFAULT_LOCALITY_BINDINGS = {
  A: COMMUNITY.homeLocalityId, // the workshop's home
  B: 'poulsbo', //               a neighbor (an easy hop)
  C: 'seattle', //               a crossing (a real trip)
};

// ─── Personas ───
//
// Eight archetypes give the spread of envelopes/doors/interests the
// matching machinery needs to demonstrate anything; fifty first names
// (first names only — the app's own privacy rule) instantiate them with
// small deterministic weight shifts so same-archetype personas still
// rank differently.

const ARCHETYPES = [
  {
    key: 'quiet-maker',
    vibe: 'Happiest with something in my hands.',
    goal: 'One regular making night with familiar faces.',
    doors: [{ door: 'connect', weight: 0.7 }, { door: 'make-learn', weight: 0.5 }],
    interests: ['pottery', 'woodworking'],
    envelope: {
      groupSize: { position: 'small' },
      structure: { position: 'activity-anchored', growthEdge: 'open-conversation' },
      familiarity: { position: 'easier-with-known-face' },
      role: { position: 'happy-to-attend' },
      novelty: { position: 'prefers-ritual' },
    },
    energy: { capacity: 'one evening at a time', frequency: 'weekly' },
    timeWindows: ['weekday-evening'],
    travelReach: 'nearby',
    barrier: 'walking into rooms of strangers',
    story: {
      prompt: 'Tell us about a recent time being around people felt easy.',
      told: 'A pottery class — everyone had something to do with their hands, so the talk came easy.',
    },
  },
  {
    key: 'games-regular',
    vibe: 'Always up for one more round.',
    goal: 'A standing games table that actually stands.',
    doors: [{ door: 'connect', weight: 0.8 }],
    interests: ['board games', 'trivia'],
    envelope: {
      groupSize: { position: 'small' },
      structure: { position: 'balanced' },
      familiarity: { position: 'fine-with-strangers' },
      role: { position: 'either' },
      novelty: { position: 'prefers-ritual' },
    },
    energy: { capacity: 'a couple of evenings', frequency: 'weekly' },
    timeWindows: ['weekday-evening', 'weekend-evening'],
    travelReach: 'a-trip',
    barrier: null,
    story: {
      prompt: 'Tell us about a recent time being around people felt easy.',
      told: 'Trivia night with strangers — the questions did the introductions for us.',
    },
  },
  {
    key: 'outdoor-morning',
    vibe: 'Best conversations happen at walking pace.',
    goal: 'People to be outside with, rain or shine.',
    doors: [{ door: 'connect', weight: 0.6 }, { door: 'useful', weight: 0.4 }],
    interests: ['running', 'hiking'],
    envelope: {
      groupSize: { position: 'large' },
      structure: { position: 'activity-anchored' },
      familiarity: { position: 'fine-with-strangers' },
      role: { position: 'either' },
      novelty: { position: 'mix' },
    },
    energy: { capacity: 'a few mornings a week', frequency: 'weekly' },
    timeWindows: ['weekend-daytime', 'weekday-daytime'],
    travelReach: 'anywhere',
    barrier: null,
    story: {
      prompt: 'Tell us about a recent time being around people felt easy.',
      told: 'A group trail run — nobody has to make eye contact on a hill.',
    },
  },
  {
    key: 'book-quiet',
    vibe: 'Give me a slow afternoon and a good chapter.',
    goal: 'A small circle that reads the same book.',
    doors: [{ door: 'connect', weight: 0.7 }],
    interests: ['book club', 'reading'],
    envelope: {
      groupSize: { position: 'intimate' },
      structure: { position: 'open-conversation' },
      familiarity: { position: 'needs-known-face', growthEdge: 'fine-with-strangers' },
      role: { position: 'happy-to-attend' },
      novelty: { position: 'prefers-ritual' },
    },
    energy: { capacity: 'a slow afternoon', frequency: 'monthly' },
    timeWindows: ['weekend-daytime'],
    travelReach: 'here',
    barrier: 'big loud rooms',
    story: {
      prompt: 'Tell us about a recent time being around people felt easy.',
      told: 'Three of us argued about a novel for two hours. It felt like ten minutes.',
    },
  },
  {
    key: 'food-host',
    vibe: 'A full table is my favorite room.',
    goal: 'Regular shared dinners with new and old faces.',
    doors: [{ door: 'connect', weight: 0.9 }, { door: 'useful', weight: 0.5 }],
    interests: ['potluck', 'cooking'],
    envelope: {
      groupSize: { position: 'large' },
      structure: { position: 'balanced' },
      familiarity: { position: 'fine-with-strangers' },
      role: { position: 'wants-a-job' },
      novelty: { position: 'mix' },
    },
    energy: { capacity: 'plenty, if it involves food', frequency: 'weekly' },
    timeWindows: ['weekend-evening', 'weekday-evening'],
    travelReach: 'a-trip',
    barrier: null,
    story: {
      prompt: 'Tell us about a recent time being around people felt easy.',
      told: 'I hosted a potluck where I only knew two people. Passing dishes broke every ice there was.',
    },
  },
  {
    key: 'service-minded',
    vibe: 'Point me at something worth doing.',
    goal: 'Ways to be useful around here, with company.',
    doors: [{ door: 'useful', weight: 0.8 }, { door: 'connect', weight: 0.5 }],
    interests: ['beach cleanup', 'volunteering'],
    envelope: {
      groupSize: { position: 'large' },
      structure: { position: 'activity-anchored' },
      familiarity: { position: 'fine-with-strangers' },
      role: { position: 'wants-a-job' },
      novelty: { position: 'mix' },
    },
    energy: { capacity: 'a solid morning', frequency: 'every couple of weeks' },
    timeWindows: ['weekend-daytime'],
    travelReach: 'anywhere',
    barrier: null,
    story: {
      prompt: 'Tell us about a recent time being around people felt easy.',
      told: 'A shore cleanup — shared work makes shared talk. You sort driftwood, you swap stories.',
    },
  },
  {
    key: 'curious-newcomer',
    vibe: 'New here — show me how this place works.',
    goal: 'A first few easy things to say yes to.',
    doors: [{ door: 'connect', weight: 0.8 }, { door: 'make-learn', weight: 0.6 }],
    interests: ['pottery', 'board games'],
    envelope: {
      groupSize: { position: 'small', growthEdge: 'large' },
      structure: { position: 'balanced' },
      familiarity: { position: 'easier-with-known-face' },
      role: { position: 'happy-to-attend' },
      novelty: { position: 'seeks-new' },
    },
    energy: { capacity: 'one thing at a time, to start', frequency: 'weekly' },
    timeWindows: ['weekday-evening', 'weekend-daytime'],
    travelReach: 'nearby',
    barrier: 'being the only new face',
    story: {
      prompt: 'Tell us about a recent time being around people felt easy.',
      told: 'A neighbor walked me into a game night and introduced me twice. That was all it took.',
    },
  },
  {
    key: 'maker-social',
    vibe: 'Sawdust and good company.',
    goal: 'A shop night where projects and people both progress.',
    doors: [{ door: 'make-learn', weight: 0.8 }, { door: 'connect', weight: 0.6 }],
    interests: ['woodworking', 'maker space'],
    envelope: {
      groupSize: { position: 'small' },
      structure: { position: 'activity-anchored' },
      familiarity: { position: 'fine-with-strangers' },
      role: { position: 'either' },
      novelty: { position: 'mix' },
    },
    energy: { capacity: 'a long evening when it counts', frequency: 'every couple of weeks' },
    timeWindows: ['weekday-evening'],
    travelReach: 'nearby',
    barrier: null,
    story: {
      prompt: 'Tell us about a recent time being around people felt easy.',
      told: 'Wood-shop night. Someone lent me a chisel and an hour of patience.',
    },
  },
];

const archetypesByKey = new Map(ARCHETYPES.map((a) => [a.key, a]));

const NAMES = [
  'Priya', 'Tom', 'Maya', 'Sam', 'Rosa', 'Ken', 'June', 'Omar', 'Bea', 'Felix',
  'Nora', 'Ravi', 'Iris', 'Cal', 'Dana', 'Theo', 'Lena', 'Marco', 'Sky', 'Ada',
  'Gus', 'Wren', 'Eli', 'Faye', 'Hank', 'Ines', 'Jude', 'Kira', 'Leo', 'Mabel',
  'Nico', 'Opal', 'Paz', 'Quinn', 'Rex', 'Sana', 'Tess', 'Uma', 'Vik', 'Willa',
  'Xan', 'Yuri', 'Zoe', 'Arlo', 'Brit', 'Cleo', 'Dev', 'Etta', 'Finn', 'Gwen',
];

const AVATARS = ['🌱', '🌿', '🍂', '🌊', '🪵', '🕯️', '🧺', '🧭', '🪴', '🌙'];

export const SEED_PERSONAS = NAMES.map((name, i) => {
  const archetype = ARCHETYPES[i % ARCHETYPES.length];
  const id = name.toLowerCase();
  return {
    id,
    name,
    email: personaEmail(id),
    avatar: AVATARS[i % AVATARS.length],
    // Slot spread: a majority at home, a band in the neighbor, a few
    // across the crossing — enough of each for every named scenario.
    slot: i < 34 ? 'A' : (i < 44 ? 'B' : 'C'),
    archetype: archetype.key,
    vibeMessage: archetype.vibe,
    // Same-archetype personas differ by a small deterministic shift —
    // never identical models, never random.
    weightShift: (i % 3) * 0.05,
    interests: archetype.interests.slice(0, (i % 2) + 1),
  };
});

export const personaById = new Map(SEED_PERSONAS.map((p) => [p.id, p]));

function round2(n) {
  return Math.round(n * 100) / 100;
}

// The onboarding transcript the OnboardingCompleted event carries —
// short, honest about being canned, grounded in the archetype's story.
export function buildTranscript(persona) {
  const a = archetypesByKey.get(persona.archetype);
  return [
    { role: 'interviewer', text: 'Welcome — what would you love more of in your week?' },
    { role: 'member', text: a.goal },
    { role: 'interviewer', text: a.story.prompt },
    { role: 'member', text: a.story.told },
  ];
}

// The Layer-2 extraction, built directly from the fixture rather than
// through the LLM stub — the stub returns ONE canned profile, and the
// whole point of the catalog is fifty distinct ones. Shape mirrors
// ONBOARDING_EXTRACTION_SCHEMA; the async projector validates positions
// against lib/envelope.mjs, so the archetypes only speak that vocabulary.
export function buildExtraction(persona) {
  const a = archetypesByKey.get(persona.archetype);
  const shift = persona.weightShift;
  const envelope = {};
  for (const [dimension, spec] of Object.entries(a.envelope)) {
    envelope[dimension] = {
      comfort: spec.position,
      position: spec.position,
      ...(spec.growthEdge
        ? { growthEdge: spec.growthEdge, edgeToward: spec.growthEdge }
        : {}),
      provenance: 'inferred',
      confidence: 'medium',
    };
  }
  envelope.energy = { ...a.energy, provenance: 'stated', confidence: 'medium' };
  return {
    narrative: {
      selfDescription: `${persona.name} — ${a.vibe}`,
      goal: a.goal,
      stories: [a.story],
    },
    doors: a.doors.map((d) => ({
      door: d.door,
      weight: round2(Math.max(0.2, d.weight - shift)),
      provenance: 'stated',
      confidence: 'medium',
    })),
    interests: persona.interests.map((tag, j) => ({
      tag,
      weight: round2(Math.max(0.3, 0.8 - shift - j * 0.15)),
      storyRef: 0,
      provenance: 'stated',
      confidence: 'medium',
    })),
    strengthsToOffer: [],
    envelope,
    constraints: { timeWindows: a.timeWindows, travelReach: a.travelReach },
    barriers: a.barrier ? [{ what: a.barrier, provenance: 'stated' }] : [],
    provisional: true,
  };
}

// ─── Events ───
//
// Twelve templates cycle through fifty slots: the first ten are PAST
// events carrying canned debriefs (so affinities and outcome rows exist
// the moment they're added), most of the rest are upcoming and planned,
// two stay proposed, one is an idea. Nine templates map onto the
// event-type register's kinds; three are deliberately untyped —
// untyped is first-class (D63) and the room should see that.

const EVENT_TEMPLATES = [
  {
    key: 'board-games',
    title: 'Board-game night',
    description: 'Bring a favorite or play what’s on the table. Newcomers dealt in first.',
    activityTags: ['board games'],
    structure: 'semi-structured',
    doors: ['connect'],
    audience: ['games-regular', 'curious-newcomer'],
    localHour: 19,
    durationHours: 3,
  },
  {
    key: 'trivia',
    title: 'Trivia night',
    description: 'Teams of whoever sits down together. The questions do the introductions.',
    activityTags: ['trivia'],
    structure: 'semi-structured',
    doors: ['connect'],
    audience: ['games-regular', 'food-host'],
    localHour: 19,
    durationHours: 2,
  },
  {
    key: 'pottery',
    title: 'Pottery open studio',
    description: 'Wheel throwing and hand-building, all levels. Clay does the talking.',
    activityTags: ['pottery', 'wheel throwing'],
    structure: 'structured',
    doors: ['make-learn', 'connect'],
    audience: ['quiet-maker', 'curious-newcomer'],
    localHour: 18,
    durationHours: 2,
    maxAttendance: 8,
  },
  {
    key: 'wood-shop',
    title: 'Wood-shop night',
    description: 'Shared bench time at the maker space. Bring a project or borrow one.',
    activityTags: ['woodworking', 'wood shop'],
    structure: 'structured',
    doors: ['make-learn'],
    audience: ['maker-social', 'quiet-maker'],
    localHour: 18,
    durationHours: 3,
    maxAttendance: 6,
  },
  {
    key: 'group-walk',
    title: 'Saturday coffee walk',
    description: 'An easy loop, coffee after. Walking pace, walking talk.',
    activityTags: ['walk'],
    structure: 'unstructured',
    doors: ['connect'],
    audience: ['outdoor-morning', 'book-quiet'],
    localHour: 9,
    durationHours: 2,
  },
  {
    key: 'running',
    title: 'Morning run club',
    description: 'A conversational-pace group run. Nobody gets dropped.',
    activityTags: ['running'],
    structure: 'structured',
    doors: ['connect'],
    audience: ['outdoor-morning', 'service-minded'],
    localHour: 7,
    durationHours: 1,
  },
  {
    key: 'potluck',
    title: 'Neighborhood potluck',
    description: 'Bring a dish, take a seat. Passing plates breaks every ice there is.',
    activityTags: ['potluck'],
    structure: 'unstructured',
    doors: ['connect'],
    audience: ['food-host', 'curious-newcomer'],
    localHour: 18,
    durationHours: 3,
    maxAttendance: 12,
  },
  {
    key: 'book-club',
    title: 'Book club',
    description: 'One book a month, argued about gently over tea.',
    activityTags: ['book club'],
    structure: 'semi-structured',
    doors: ['connect'],
    audience: ['book-quiet', 'quiet-maker'],
    localHour: 14,
    durationHours: 2,
  },
  {
    key: 'shore-cleanup',
    title: 'Shore cleanup morning',
    description: 'Gloves and bags provided. Shared work makes shared talk.',
    activityTags: ['beach cleanup'],
    structure: 'structured',
    doors: ['useful', 'connect'],
    audience: ['service-minded', 'outdoor-morning'],
    localHour: 10,
    durationHours: 2,
  },
  {
    key: 'photography',
    title: 'Sunset photography meetup',
    description: 'Cameras or phones, golden hour, no expertise required.',
    activityTags: ['photography'],
    structure: 'unstructured',
    doors: ['make-learn', 'connect'],
    audience: ['curious-newcomer', 'outdoor-morning'],
    localHour: 19,
    durationHours: 2,
  },
  {
    key: 'garden',
    title: 'Community garden work party',
    description: 'Weeding, mulching, and whatever the beds need. Tools on site.',
    activityTags: ['gardening'],
    structure: 'structured',
    doors: ['useful'],
    audience: ['service-minded', 'food-host'],
    localHour: 10,
    durationHours: 3,
  },
  {
    key: 'listening',
    title: 'Open-mic listening night',
    description: 'Local players, easy chairs. Come to listen, stay to chat between sets.',
    activityTags: ['live music'],
    structure: 'unstructured',
    doors: ['connect'],
    audience: ['book-quiet', 'games-regular'],
    localHour: 19,
    durationHours: 2,
  },
];

const LOCATIONS = {
  A: ['The Grange Hall', 'The library meeting room', 'The waterfront pavilion', 'The maker space', 'The community room'],
  B: ['The harborside cafe', 'The community hall'],
  C: ['The market atrium', 'The pier plaza'],
};

const AGAIN_CYCLE = ['yes', 'yes', 'maybe', 'yes', 'no'];
const TEXTURES = [
  ['great-company'],
  ['the-activity-itself'],
  ['great-company', 'well-run'],
  ['just-right'],
  ['the-place'],
];

const EVENT_COUNT = 50;
const PAST_COUNT = 10;

function buildEvents() {
  const events = [];
  for (let i = 0; i < EVENT_COUNT; i++) {
    const t = EVENT_TEMPLATES[i % EVENT_TEMPLATES.length];
    const past = i < PAST_COUNT;
    const idea = i === EVENT_COUNT - 1;
    const proposedOnly = i === EVENT_COUNT - 2 || i === EVENT_COUNT - 3;
    const slot = i % 7 === 3 ? 'B' : (i % 7 === 5 ? 'C' : 'A');

    // Candidates: personas whose archetype belongs to the template's
    // audience, rotated by event index so rosters vary; one wildcard
    // from the whole catalog keeps rooms from becoming echo chambers.
    const candidates = SEED_PERSONAS.filter((p) => t.audience.includes(p.archetype));
    const rot = (i * 3) % candidates.length;
    const rotated = [...candidates.slice(rot), ...candidates.slice(0, rot)];
    const organizer = rotated[0].id;
    const confirmedCount = 3 + (i % 3);
    const interestedCount = 2 + (i % 2);
    const confirmed = idea ? [] : rotated.slice(0, confirmedCount).map((p) => p.id);
    const interested = rotated
      .slice(confirmedCount, confirmedCount + interestedCount)
      .map((p) => p.id);
    const wildcard = SEED_PERSONAS[(i * 7) % SEED_PERSONAS.length].id;
    if (!confirmed.includes(wildcard) && !interested.includes(wildcard)) {
      interested.push(wildcard);
    }

    // Canned debriefs for past events: most attended, one occasional
    // no-show; taps positive-only (see-again on a fellow attendee) —
    // affinity edges and outcome rows exist the moment the event lands.
    let debriefs;
    if (past) {
      debriefs = confirmed.map((pid, j) => {
        if (j === confirmed.length - 1 && i % 2 === 0) {
          return { personaId: pid, attended: false, noShowReason: 'energy' };
        }
        const attendees = confirmed.filter((c, k) => c !== pid
          && !(k === confirmed.length - 1 && i % 2 === 0));
        const tapped = attendees.length > 0
          ? [{ personaId: attendees[(i + j) % attendees.length], seeAgain: (i + j) % 3 !== 2 }]
          : [];
        return {
          personaId: pid,
          attended: true,
          again: AGAIN_CYCLE[(i + j) % AGAIN_CYCLE.length],
          outcomeTexture: TEXTURES[(i + j) % TEXTURES.length],
          people: tapped,
        };
      });
    }

    const pool = LOCATIONS[slot];
    events.push({
      id: `seed-e${String(i + 1).padStart(2, '0')}`,
      templateKey: t.key,
      title: t.title,
      description: t.description,
      slot,
      // Past events step -20…-2 days; upcoming cycle +1…+20.
      offsetDays: past ? -20 + 2 * i : ((i - PAST_COUNT) % 20) + 1,
      localHour: idea ? null : t.localHour,
      durationHours: t.durationHours,
      status: idea ? 'idea' : (proposedOnly ? 'proposed' : 'planned'),
      location: idea ? null : pool[i % pool.length],
      shape: { activityTags: t.activityTags, structure: t.structure, doors: t.doors },
      ...(t.maxAttendance !== undefined ? { maxAttendance: t.maxAttendance } : {}),
      organizer,
      confirmed,
      interested,
      ...(debriefs ? { debriefs } : {}),
    });
  }
  return events;
}

export const SEED_EVENTS = buildEvents();

export const seedEventById = new Map(SEED_EVENTS.map((e) => [e.id, e]));

// Concrete times from the simulated clock at seed time. The community
// runs on Pacific time; a fixed -7 offset (PDT) is deliberately good
// enough for a fixture — windows land where the demo needs them.
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LOCAL_UTC_OFFSET_HOURS = 7;

export function eventTimes(spec, nowMs) {
  if (spec.localHour === null || spec.localHour === undefined) return {};
  const start = new Date(nowMs + spec.offsetDays * DAY_MS);
  start.setUTCMinutes(0, 0, 0);
  start.setUTCHours(spec.localHour + LOCAL_UTC_OFFSET_HOURS);
  const end = new Date(start.getTime() + spec.durationHours * HOUR_MS);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}
