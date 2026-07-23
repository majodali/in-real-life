// The workshop seed routes (D64 slice 2, docs/admin-and-support.md → §2
// Workshop) — WORKSHOP-ONLY: registered inside the `if (isWorkshop)`
// block, absent from production route tables (docs/workshop-mode.md).
//
//   GET  /admin/seed — the catalog + live status: which personas are
//        seeded, which events added, the stored locality bindings, and
//        the fixture password the "open as" affordance needs.
//   POST /admin/seed — two-phase, everything through real commands with
//        the admin as audited actor:
//          { personas: true, localityBindings? }  — seed ALL catalog
//            personas once (register → profile → locality chain →
//            onboarding, per-persona extraction built from the fixture),
//            binding symbolic slots A/B/C to register localities.
//            Idempotent and resumable per persona (state-row flags say
//            which steps remain; deterministic commandIds converge
//            retries mid-chain).
//          { events: [ids] } — add catalog events additively, each with
//            its pre-set roster and (for past events) canned debriefs,
//            so affinities and outcome rows exist the moment it lands.
//            Idempotent per entity via deterministic commandIds — re-
//            adding heals a partially seeded event instead of skipping.
//
// Long batches yield before the API-gateway timeout: the response
// carries `remaining` and the console simply calls again. Personas load
// WHOLE by design (rosters are the only exposure surface — an event can
// never reference an unseeded persona); the optional `personaIds`
// filter exists for functional tests only, never surfaced in the UI.

import { randomUUID } from 'node:crypto';
import { GetCommand, ScanCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { LOCALITIES, isValidLocalityId } from '../lib/localities.mjs';
import { classifyEventType } from '../lib/event-types.mjs';
import {
  SEED_PERSONAS, SEED_EVENTS, personaById, seedEventById,
  buildExtraction, buildTranscript, eventTimes,
  SEED_PASSWORD, SEED_SLOTS, DEFAULT_LOCALITY_BINDINGS, personaEmail,
} from './seed-fixture.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const SEED_CONFIG_KEY = 'workshop-seed';
const SEED_AGGREGATE_ID = 'system#workshop-seed';
// Yield well before the 30s API timeout; the console loops on `remaining`.
const TIME_BUDGET_MS = 18000;

function reply(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function requireAdmin(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims || !claims.sub) return { error: reply(401, { error: 'unauthorized' }) };
  if (claims['custom:role'] !== 'admin') return { error: reply(403, { error: 'admin only' }) };
  return { adminId: claims.sub };
}

const localitiesById = new Map(LOCALITIES.map((l) => [l.id, l]));

// A slot binding must name a register locality that can anchor a member
// (postal → home locality is how the feed finds their perspective).
function validateBindings(requested) {
  const bindings = { ...DEFAULT_LOCALITY_BINDINGS };
  if (requested === undefined) return { bindings };
  if (typeof requested !== 'object' || requested === null || Array.isArray(requested)) {
    return { error: 'localityBindings must be an object of slot → localityId' };
  }
  for (const [slot, localityId] of Object.entries(requested)) {
    if (!SEED_SLOTS.includes(slot)) return { error: `unknown slot ${slot} (slots are A, B, C)` };
    if (!isValidLocalityId(localityId)) return { error: `unknown localityId ${localityId}` };
    if ((localitiesById.get(localityId)?.postalCodes ?? []).length === 0) {
      return { error: `${localityId} has no postal codes — it cannot anchor seeded members` };
    }
    bindings[slot] = localityId;
  }
  return { bindings };
}

function sameBindings(a, b) {
  return SEED_SLOTS.every((slot) => a?.[slot] === b?.[slot]);
}

export function createSeedHandlers({
  runner, client, cognito, usersTable, eventsTable, configTable,
  userPoolId, getOffset, getRequiredAgreement,
}) {
  async function readSeedConfig() {
    const out = await client.send(new GetCommand({
      TableName: configTable,
      Key: { configKey: SEED_CONFIG_KEY },
    }));
    return out.Item ?? null;
  }

  // All fixture accounts share the `seed-` email prefix, so one scan
  // maps email → state row — both the status read and the per-persona
  // resume logic run off it (admin cadence; community scale).
  async function seedStateRows() {
    const byEmail = new Map();
    let ExclusiveStartKey;
    do {
      const out = await client.send(new ScanCommand({
        TableName: usersTable,
        FilterExpression: 'begins_with(email, :prefix)',
        ExpressionAttributeValues: { ':prefix': 'seed-' },
        ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
      }));
      for (const item of out.Items ?? []) byEmail.set(item.email, item);
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return byEmail;
  }

  async function existingEventIds() {
    const present = new Set();
    const ids = SEED_EVENTS.map((e) => e.id);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const out = await client.send(new BatchGetCommand({
        RequestItems: {
          [eventsTable]: {
            Keys: chunk.map((eventId) => ({ eventId })),
            ProjectionExpression: 'eventId',
          },
        },
      }));
      for (const item of out.Responses?.[eventsTable] ?? []) present.add(item.eventId);
    }
    return present;
  }

  async function ensureCognitoUser(email) {
    let attributes;
    try {
      const out = await cognito.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS',
      }));
      attributes = out.User?.Attributes;
    } catch (err) {
      if (err?.name !== 'UsernameExistsException') throw err;
      const out = await cognito.send(new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      }));
      attributes = out.UserAttributes;
    }
    const sub = attributes?.find((a) => a.Name === 'sub')?.Value;
    if (!sub) throw new Error(`Cognito returned no sub for ${email}`);
    // Always (re)set the fixture password — idempotent, and it heals an
    // account created by a crashed earlier run.
    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: SEED_PASSWORD,
      Permanent: true,
    }));
    return sub;
  }

  // One persona, whole chain — resumable: the state row's flags say
  // which steps already landed; deterministic commandIds (salted by the
  // seeding generation, so a torn-down stack can re-seed without hitting
  // the previous generation's cached command records) make any overlap
  // converge at the idempotency table.
  async function seedPersona(persona, bindings, generation, row, adminId) {
    const sub = await ensureCognitoUser(persona.email);
    const locality = localitiesById.get(bindings[persona.slot]);
    const aggregateId = `user#${sub}`;
    let seq = row?.seq ?? 0;

    const emit = async (step, eventType, data) => {
      seq += 1;
      await runner.runCommand({
        commandId: `seed:${generation}:p:${persona.id}:${step}`,
        aggregateId,
        actorId: `user#${adminId}`,
        events: [{ eventType, version: 1, seq, data }],
        result: { userId: sub, step },
      });
    };

    if (!row) {
      const required = await getRequiredAgreement();
      await emit('register', 'UserRegistered', {
        userId: sub,
        email: persona.email,
        agreementVersion: required.version ?? 'v1',
        path: 'seed',
      });
    }
    if (!row?.name) {
      await emit('profile', 'UserProfileCreated', {
        userId: sub,
        name: persona.name,
        avatar: persona.avatar,
        vibeMessage: persona.vibeMessage,
      });
    }
    if (!row?.city) {
      await emit('locality', 'LocalityVerificationRequested', {
        userId: sub,
        city: locality.name,
        postalCode: locality.postalCodes[0],
        country: 'US',
      });
    }
    if (!row?.localityVerified) {
      await emit('verify', 'LocalityVerified', {
        userId: sub, verifiedBy: adminId, method: 'seed',
      });
    }
    if (!row?.activated) {
      await emit('activate', 'UserActivated', { userId: sub });
    }
    if (!row?.onboardingCompletedAt) {
      await emit('onboarding', 'OnboardingCompleted', {
        userId: sub,
        transcript: buildTranscript(persona),
        extraction: buildExtraction(persona),
      });
    }
    return sub;
  }

  async function handlePersonasPhase(body, adminId) {
    const checked = validateBindings(body.localityBindings);
    if (checked.error) return reply(400, { error: checked.error });

    let bindings = checked.bindings;
    let generation;
    const stored = await readSeedConfig();
    if (stored) {
      if (body.localityBindings !== undefined
        && !sameBindings(stored.localityBindings, bindings)) {
        return reply(409, {
          error: 'personas already seeded with different bindings — a new binding is a new workshop stack, not a re-seed',
          bindings: stored.localityBindings,
        });
      }
      bindings = stored.localityBindings;
      generation = stored.generation ?? '0';
    } else {
      // A fresh generation id salts every commandId this seeding emits;
      // the commandId here is generation-unique too, so a stack whose
      // rows were torn down (but whose command records haven't TTL'd)
      // re-seeds cleanly. A concurrent first-seed loses the seq-1 race
      // and adopts the winner's config.
      generation = randomUUID();
      try {
        await runner.runCommand({
          commandId: `seed:config:${generation}`,
          aggregateId: SEED_AGGREGATE_ID,
          actorId: `user#${adminId}`,
          events: [{
            eventType: 'WorkshopSeedConfigured',
            version: 1,
            seq: 1,
            data: { localityBindings: bindings, generation },
          }],
          result: { localityBindings: bindings, generation },
        });
      } catch (err) {
        if (err?.name !== 'TransactionCanceledException') throw err;
        const raced = await readSeedConfig();
        if (!raced) throw err;
        bindings = raced.localityBindings;
        generation = raced.generation ?? '0';
      }
    }

    // Test hook only (never surfaced in the console): personas load
    // whole in real use — see the module note.
    const wanted = Array.isArray(body.personaIds)
      ? SEED_PERSONAS.filter((p) => body.personaIds.includes(p.id))
      : SEED_PERSONAS;

    const rows = await seedStateRows();
    const pending = wanted.filter((p) => !rows.get(p.email)?.onboardingCompletedAt);

    const deadline = Date.now() + TIME_BUDGET_MS;
    const processed = [];
    const errors = [];
    for (const persona of pending) {
      if (Date.now() > deadline) break;
      try {
        await seedPersona(persona, bindings, generation, rows.get(persona.email) ?? null, adminId);
        processed.push(persona.id);
      } catch (err) {
        // A concurrent seeder winning a step is convergence, not failure
        // — but surface it so the operator sees anything genuinely stuck.
        errors.push({ id: persona.id, error: err?.name ?? String(err?.message ?? err) });
        console.error(`seed persona ${persona.id} failed:`, err);
      }
    }

    return reply(200, {
      phase: 'personas',
      bindings,
      processed,
      ...(errors.length ? { errors } : {}),
      seeded: wanted.length - pending.length + processed.length,
      total: wanted.length,
      remaining: pending.length - processed.length,
    });
  }

  // One event, whole chain: propose (+ schedule), roster interactions,
  // canned debriefs. Every step has a deterministic commandId, so re-
  // adding an already-present event is a fast pass through the
  // idempotency cache that also completes any partially seeded chain.
  async function seedEvent(spec, bindings, generation, subByPersonaId, nowMs, adminId) {
    const actorId = `user#${adminId}`;
    const organizer = personaById.get(spec.organizer);
    const organizerSub = subByPersonaId.get(spec.organizer);
    const { startTime, endTime } = eventTimes(spec, nowMs);

    const data = {
      eventId: spec.id,
      source: 'community',
      title: spec.title,
      organizerId: organizerSub,
      organizerName: organizer.name,
      description: spec.description,
      localityId: bindings[spec.slot],
      shape: spec.shape,
      timesApproximate: false,
      minimumAttendance: 3,
      autoPlanOnThreshold: false,
    };
    if (startTime !== undefined) {
      data.startTime = startTime;
      data.endTime = endTime;
    }
    if (spec.location) data.location = spec.location;
    if (spec.maxAttendance !== undefined) data.maxAttendance = spec.maxAttendance;
    const eventTypeId = classifyEventType({ shape: spec.shape, title: spec.title });
    if (eventTypeId !== null) {
      data.eventTypeId = eventTypeId;
      data.eventTypeSource = 'derived';
    }

    const proposed = await runner.runCommand({
      commandId: `seed:${generation}:e:${spec.id}`,
      aggregateId: `event#${spec.id}`,
      actorId,
      events: [{ eventType: 'EventProposed', version: 1, seq: 1, data }],
      result: { eventId: spec.id },
    });

    if (spec.status === 'planned') {
      await runner.runCommand({
        commandId: `seed:${generation}:e:${spec.id}:schedule`,
        aggregateId: `event#${spec.id}`,
        actorId,
        events: [{
          eventType: 'EventScheduled',
          version: 1,
          seq: 2,
          data: { eventId: spec.id, scheduledBy: 'organizer', autoTriggered: false },
        }],
        result: { eventId: spec.id, lifecycleState: 'planned' },
      });
    }

    const roster = [
      ...spec.confirmed.map((personaId) => ({ personaId, level: 'confirmed' })),
      ...spec.interested.map((personaId) => ({ personaId, level: 'interested' })),
    ];
    for (const { personaId, level } of roster) {
      const sub = subByPersonaId.get(personaId);
      await runner.runCommand({
        commandId: `seed:${generation}:i:${spec.id}:${personaId}`,
        aggregateId: `interaction#${sub}#${spec.id}`,
        actorId,
        events: [{
          eventType: level === 'confirmed' ? 'AttendanceConfirmed' : 'InterestExpressed',
          version: 1,
          seq: 1,
          data: {
            userId: sub,
            eventId: spec.id,
            userName: personaById.get(personaId).name,
            previousLevel: null,
          },
        }],
        result: { eventId: spec.id, level },
      });
    }

    for (const debrief of spec.debriefs ?? []) {
      const sub = subByPersonaId.get(debrief.personaId);
      const d = { userId: sub, eventId: spec.id, attended: debrief.attended };
      if (eventTypeId !== null) d.eventTypeId = eventTypeId;
      if (debrief.attended) {
        d.again = debrief.again;
        if (debrief.outcomeTexture?.length) d.outcomeTexture = debrief.outcomeTexture;
        const people = (debrief.people ?? []).map((tap) => ({
          userId: subByPersonaId.get(tap.personaId),
          met: true,
          seeAgain: tap.seeAgain === true,
        }));
        if (people.length) d.people = people;
      } else if (debrief.noShowReason) {
        d.noShowReason = debrief.noShowReason;
      }
      await runner.runCommand({
        commandId: `seed:${generation}:d:${spec.id}:${debrief.personaId}`,
        aggregateId: `interaction#${sub}#${spec.id}`,
        actorId,
        events: [{ eventType: 'DebriefSubmitted', version: 1, seq: 2, data: d }],
        result: { eventId: spec.id, attended: debrief.attended },
      });
    }

    return proposed.cached ? 'already' : 'added';
  }

  async function handleEventsPhase(body, adminId) {
    const ids = body.events;
    for (const id of ids) {
      if (!seedEventById.has(id)) return reply(400, { error: `unknown catalog event ${id}` });
    }

    const stored = await readSeedConfig();
    if (!stored) {
      return reply(409, { error: 'seed personas first — events reference them' });
    }
    const bindings = stored.localityBindings;
    const generation = stored.generation ?? '0';

    // Resolve every referenced persona to their Cognito sub via the
    // state rows the personas phase wrote. Personas load whole, so a
    // missing one means that phase hasn't finished.
    const referenced = new Set();
    for (const id of ids) {
      const spec = seedEventById.get(id);
      referenced.add(spec.organizer);
      for (const pid of [...spec.confirmed, ...spec.interested]) referenced.add(pid);
      for (const debrief of spec.debriefs ?? []) {
        referenced.add(debrief.personaId);
        for (const tap of debrief.people ?? []) referenced.add(tap.personaId);
      }
    }
    const rows = await seedStateRows();
    const subByPersonaId = new Map();
    for (const pid of referenced) {
      const row = rows.get(personaEmail(pid));
      if (!row?.onboardingCompletedAt) {
        return reply(409, { error: `persona ${pid} is not seeded yet — finish the personas phase first` });
      }
      subByPersonaId.set(pid, row.userId);
    }

    const offsetMs = getOffset ? (await getOffset()).offsetMs : 0;
    const nowMs = Date.now() + offsetMs;

    const deadline = Date.now() + TIME_BUDGET_MS;
    const results = [];
    const remaining = [];
    for (const id of ids) {
      if (Date.now() > deadline) {
        remaining.push(id);
        continue;
      }
      try {
        const status = await seedEvent(
          seedEventById.get(id), bindings, generation, subByPersonaId, nowMs, adminId,
        );
        results.push({ id, status });
      } catch (err) {
        results.push({ id, status: 'error', error: err?.name ?? String(err?.message ?? err) });
        console.error(`seed event ${id} failed:`, err);
      }
    }

    return reply(200, { phase: 'events', results, remaining });
  }

  async function postSeedHandler(event) {
    const gate = requireAdmin(event);
    if (gate.error) return gate.error;

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return reply(400, { error: 'invalid json body' });
    }

    if (body.personas === true) return handlePersonasPhase(body, gate.adminId);
    if (Array.isArray(body.events)) return handleEventsPhase(body, gate.adminId);
    return reply(400, { error: 'body must be { personas: true, localityBindings? } or { events: [ids] }' });
  }

  async function getSeedHandler(event) {
    const gate = requireAdmin(event);
    if (gate.error) return gate.error;

    const [stored, rows, present] = await Promise.all([
      readSeedConfig(),
      seedStateRows(),
      existingEventIds(),
    ]);

    const personas = SEED_PERSONAS.map((p) => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      email: p.email,
      seeded: rows.get(p.email)?.onboardingCompletedAt !== undefined,
    }));

    const events = SEED_EVENTS.map((e) => ({
      id: e.id,
      title: e.title,
      slot: e.slot,
      status: e.status,
      offsetDays: e.offsetDays,
      past: e.offsetDays < 0,
      eventTypeId: classifyEventType({ shape: e.shape, title: e.title }),
      confirmedCount: e.confirmed.length,
      interestedCount: e.interested.length,
      debriefCount: (e.debriefs ?? []).length,
      added: present.has(e.id),
    }));

    return reply(200, {
      bindings: stored?.localityBindings ?? null,
      defaultBindings: DEFAULT_LOCALITY_BINDINGS,
      // Public test data by construction — the console shows it beside
      // "open as" so a facilitator can drive any persona.
      password: SEED_PASSWORD,
      seededPersonas: personas.filter((p) => p.seeded).length,
      totalPersonas: personas.length,
      personas,
      events,
    });
  }

  return { getSeedHandler, postSeedHandler };
}
