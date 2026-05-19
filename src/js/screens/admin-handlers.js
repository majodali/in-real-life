// Admin-screen time-action handler.
//
// One handler for advance / set / reset. Validates the per-action inputs,
// calls commands.advanceTime, then invokes onSuccess so the DOM glue can
// refresh the display. Toasts on validation failure or API error.
//
// See admin-handlers.test.mjs for the spec.

export async function handleTimeAction({
  action,
  args = {},
  commands,
  showToast,
  onSuccess,
}) {
  if (action === 'set') {
    if (!args.datetime) {
      showToast('Pick a datetime to set the clock to.');
      return;
    }
  } else if (action === 'advance') {
    const hours = Number(args.hours) || 0;
    const days = Number(args.days) || 0;
    if (hours === 0 && days === 0) {
      showToast('Enter hours or days to advance.');
      return;
    }
  }

  const payload = { action };
  if (action === 'set') payload.datetime = args.datetime;
  if (action === 'advance') {
    if (args.hours !== undefined) payload.hours = args.hours;
    if (args.days !== undefined) payload.days = args.days;
  }

  try {
    const result = await commands.advanceTime(payload);
    onSuccess(result);
  } catch (err) {
    if (err?.status === 403) {
      showToast('Admin only — this action is not allowed for your account.');
    } else {
      showToast(err?.message || 'Something went wrong. Try again.');
    }
  }
}
