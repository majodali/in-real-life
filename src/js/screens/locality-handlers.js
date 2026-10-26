// Pure submit handler for the locality screen.
//
// Validates the city input, calls verifyLocality (which fans out to the
// backend's three-step Requested → Verified → Activated chain), and routes
// via the injected navigate / showToast callbacks. DOM access lives in
// locality.js so this layer can be exercised in unit tests.

import { text } from '../copy.js';
import { errorText } from '../errors.js';

export async function handleLocalitySubmit({
  city,
  postalCode,
  country,
  commands,
  navigate,
  showToast,
}) {
  const trimmedCity = (city ?? '').trim();
  if (!trimmedCity) {
    showToast(text('auth.locality.needCity'));
    return;
  }

  const trimmedPostal = (postalCode ?? '').trim();
  if (!trimmedPostal) {
    showToast(text('auth.needPostal'));
    return;
  }

  const args = { city: trimmedCity, postalCode: trimmedPostal };
  const trimmedCountry = (country ?? '').trim();
  if (trimmedCountry) args.country = trimmedCountry;

  try {
    await commands.verifyLocality(args);
    navigate('welcome');
  } catch (err) {
    if (err.status === 404) {
      showToast(text('auth.notRegistered'));
      navigate('signin');
    } else if (err.status === 409) {
      // Already activated — fine, just move on.
      navigate('welcome');
    } else if (err.status === 422) {
      // Defence-in-depth on the backend rejected the postal code. Shouldn't
      // happen in the normal flow because the sign-up gate already checked.
      showToast(text('auth.locality.notServed'));
    } else {
      showToast(errorText(err, 'auth.locality.failed'));
    }
  }
}
