// en-US — the locale and its named date/time formats, apart from the
// strings so a page that needs one surface can load just that surface
// (src/js/taglines.js) and still format the bundle's way.

export const locale = 'en-US';

// Named date/time formats, used through copy.date(value, name). The
// bundle owns the locale; the visitor's browser locale does not decide
// how a US community's dates read.
export const formats = {
  eventStart: { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  // The end of an event that finishes the same day it starts.
  eventTime: { hour: 'numeric', minute: '2-digit' },
  // When an event was last edited, in full (a tooltip).
  editedAt: { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' },
  // A calendar date with no time of day: read in UTC, so an ISO date
  // ('2026-05-14') is the same day wherever the reader is.
  agreementDate: { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' },
};
