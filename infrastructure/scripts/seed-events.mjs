// Seed a curated batch of test events via the live API.
//
// Calls POST /events for each entry as an authenticated user, so the
// events go through the same propose path the UI uses — no direct DB
// writes, no special seeding events. organizerId is whoever signs in;
// organizerName is set per-entry to give the feed visible variety.
//
// Usage:
//   IRL_API_URL=https://api.in-real.life \
//   IRL_ID_TOKEN=eyJraWQiOi...  \
//   node infrastructure/scripts/seed-events.mjs
//
// Get an idToken by signing in at in-real.life and reading
// `localStorage.getItem('irl_auth_tokens')` in the browser console —
// the `idToken` field is what you want.
//
// Re-running with the same idToken is safe: each entry mints a fresh
// commandId per run, so re-runs add fresh events rather than dedup'ing.

import { randomUUID } from 'node:crypto';

const apiUrl = process.env.IRL_API_URL;
const idToken = process.env.IRL_ID_TOKEN;

if (!apiUrl || !idToken) {
  console.error('Usage: IRL_API_URL=... IRL_ID_TOKEN=... node infrastructure/scripts/seed-events.mjs');
  process.exit(1);
}

// Relative dates so the seed stays useful no matter when it runs.
// All times are local-clock anchored, then converted to ISO.
function inDays(days, hours, minutes = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

const events = [
  {
    title: 'Morning coffee & walk',
    description: 'Easy walk along the waterfront, coffee at Blackbird afterwards.',
    startTime: inDays(3, 8, 30),
    endTime: inDays(3, 10, 0),
    location: 'Blackbird Bakery',
    organizerName: 'Sarah',
    minimumAttendance: 3,
  },
  {
    title: 'Winslow Farmers Market — meet up at the entrance',
    description: 'Wander, sample, chat. Mostly we hang at the bread stall.',
    startTime: inDays(4, 9, 30),
    endTime: inDays(4, 11, 0),
    location: 'Winslow Way',
    organizerName: 'James',
  },
  {
    title: 'Acoustic night at Harbour Pub',
    description: 'Local musicians, no cover. Comfortable for new faces.',
    startTime: inDays(5, 19, 0),
    endTime: inDays(5, 22, 0),
    location: 'Harbour Pub',
    organizerName: 'Mike',
    minimumAttendance: 4,
  },
  {
    title: 'Sunset beach photo walk',
    description: 'Bring a phone or a camera. We meander, we shoot, we share.',
    startTime: inDays(6, 19, 30),
    endTime: inDays(6, 21, 0),
    location: 'Pritchard Park',
    organizerName: 'Ava',
    minimumAttendance: 3,
  },
  {
    title: 'Book club — "The Overstory"',
    description: 'Chapters 1-4. Bring your favourite tree.',
    startTime: inDays(7, 19, 0),
    endTime: inDays(7, 21, 0),
    location: 'Eagle Harbor Books',
    organizerName: 'Priya',
    minimumAttendance: 5,
  },
  {
    title: 'Pickup soccer at Battle Point',
    description: 'Casual, all skill levels. Bring water.',
    startTime: inDays(8, 18, 0),
    endTime: inDays(8, 19, 30),
    location: 'Battle Point Park',
    organizerName: 'Tom',
    minimumAttendance: 6,
  },
  {
    title: 'Trivia night',
    description: 'Pub trivia, teams of up to 6. Mixed tables welcome.',
    startTime: inDays(10, 19, 30),
    endTime: inDays(10, 22, 0),
    location: 'Harbour Pub',
    organizerName: 'Jordan',
    minimumAttendance: 4,
  },
  {
    title: 'Sunday garden potluck',
    description: 'Bring a dish to share and something to talk about.',
    startTime: inDays(14, 13, 0),
    endTime: inDays(14, 16, 0),
    location: 'Strawberry Hill Park',
    organizerName: 'Linda',
    minimumAttendance: 6,
  },
];

async function postEvent(entry) {
  const body = { commandId: randomUUID(), ...entry };
  const res = await fetch(`${apiUrl}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

let created = 0;
let failed = 0;
for (const entry of events) {
  const { status, body } = await postEvent(entry);
  if (status === 201 || status === 200) {
    created++;
    console.log(`✓ ${status} ${entry.title} → ${body.eventId}`);
  } else {
    failed++;
    console.error(`✗ ${status} ${entry.title} → ${JSON.stringify(body)}`);
  }
}

console.log(`\nSeed complete: ${created} created, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
