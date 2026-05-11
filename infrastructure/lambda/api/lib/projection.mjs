// Projection registry/dispatcher.
//
// See projection.test.mjs for the spec and docs/event-sourcing.md for how
// projections fit into the command and replay paths.

export function createProjector({ registry, tables = {} }) {
  function applyToOne(event) {
    const fn = registry[event.eventType];
    if (!fn) {
      throw new Error(`no projection registered for event type "${event.eventType}"`);
    }
    const out = fn(event, tables);
    if (out == null) return [];
    return Array.isArray(out) ? out : [out];
  }

  function applyTo(events) {
    const writes = [];
    for (const event of events) {
      writes.push(...applyToOne(event));
    }
    return writes;
  }

  return { applyToOne, applyTo };
}
