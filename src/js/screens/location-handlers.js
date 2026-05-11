// Pure handlers for the pre-signup location gate.
//
// handleLocationCheck — asks the backend whether the entered postal code
// is supported. On "yes," stashes location for the locality screen later
// and signals the screen to advance to sign-up. On "no," signals the
// screen to swap into the notify-me capture form.
//
// handleNotifySubmit — captures email + postal code for the notify list
// when the area isn't supported.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleLocationCheck({
  postalCode,
  commands,
  showToast,
  onSupported,
  onUnsupported,
  stash,
}) {
  const trimmed = (postalCode ?? '').trim();
  if (!trimmed) {
    showToast('Please enter your postal code.');
    return;
  }

  let result;
  try {
    result = await commands.checkLocality({ postalCode: trimmed });
  } catch (err) {
    showToast(err.message || 'Could not check your location. Please try again.');
    return;
  }

  if (result.supported) {
    stash({ postalCode: trimmed, area: result.area });
    onSupported({ postalCode: trimmed, area: result.area });
  } else {
    onUnsupported({ postalCode: trimmed });
  }
}

export async function handleNotifySubmit({
  email,
  postalCode,
  commands,
  showToast,
  onNotifySuccess,
}) {
  const trimmed = (email ?? '').trim();
  if (!EMAIL_RE.test(trimmed)) {
    showToast('Please enter a valid email address.');
    return;
  }

  try {
    await commands.requestNotify({ email: trimmed, postalCode });
    onNotifySuccess();
  } catch (err) {
    showToast(err.message || 'Could not add you to the list. Please try again.');
  }
}
