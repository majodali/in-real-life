// An event's lifecycle state as members read it — the feed cards and the
// event screen share these words (src/copy/<locale>/common.js).

import { text } from './copy.js';

const KEYS = {
  idea: 'common.state.idea',
  proposed: 'common.state.proposed',
  planned: 'common.state.planned',
  'in-progress': 'common.state.inProgress',
  over: 'common.state.over',
  cancelled: 'common.state.cancelled',
  upcoming: 'common.state.upcoming',
};

/** Plain text; a state this list doesn't know shows as itself. */
export function lifecycleLabel(state) {
  return KEYS[state] ? text(KEYS[state]) : state;
}
