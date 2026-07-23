// Workshop-seed handlers for the admin screen (D64 slice 2,
// docs/admin-and-support.md → §2 Workshop) — the testable logic behind
// the panel's DOM glue.
//
// Personas load WHOLE: the backend processes what fits in one call and
// reports `remaining`, so the loop here simply calls again until the
// catalog is in — with a stall guard so a persistently failing persona
// surfaces as an error instead of an endless spinner.
//
// See seed-handlers.test.mjs for the spec.

export async function runSeedPersonas({ commands, localityBindings, onProgress }) {
  let out = await commands.seedPersonas({ localityBindings });
  onProgress?.(out);
  let previousRemaining = Infinity;
  while (out.remaining > 0) {
    if (out.remaining >= previousRemaining && (out.processed?.length ?? 0) === 0) {
      throw new Error(
        out.errors?.length
          ? `Seeding stalled: ${out.errors.map((e) => `${e.id} (${e.error})`).join(', ')}`
          : 'Seeding stalled without progress.',
      );
    }
    previousRemaining = out.remaining;
    // Bindings are pinned by the first call; follow-ups just continue.
    out = await commands.seedPersonas({});
    onProgress?.(out);
  }
  return out;
}

// Add one catalog event (the selection unit). Surfaces a per-event
// error status as a throw so the DOM glue can toast it.
export async function runAddSeedEvent({ commands, eventId }) {
  const out = await commands.seedEvents({ eventIds: [eventId] });
  const result = (out.results ?? []).find((r) => r.id === eventId);
  if (!result) throw new Error('The event was not processed — try again.');
  if (result.status === 'error') {
    throw new Error(`Could not add ${eventId}: ${result.error}`);
  }
  return result; // { id, status: 'added' | 'already' }
}

// "Open as" (per-tab identity isolation does the rest on workshop
// stacks): a new tab onto sign-in with the persona's fixture email
// prefilled. Path-relative so it works wherever the app shell lives.
export function openAsUrl(email, pathname = globalThis.location?.pathname ?? '') {
  return `${pathname}#signin/${encodeURIComponent(email)}`;
}
