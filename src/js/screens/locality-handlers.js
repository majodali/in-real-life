// Pure submit handler for the locality screen.
//
// Validates the city input, calls verifyLocality (which fans out to the
// backend's three-step Requested → Verified → Activated chain), and routes
// via the injected navigate / showToast callbacks. DOM access lives in
// locality.js so this layer can be exercised in unit tests.

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
    showToast('Please enter your city or town.');
    return;
  }

  const trimmedPostal = (postalCode ?? '').trim();
  if (!trimmedPostal) {
    showToast('Please enter your postal code.');
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
      showToast('Account not registered yet — please sign in again.');
      navigate('signin');
    } else if (err.status === 409) {
      // Already activated — fine, just move on.
      navigate('welcome');
    } else if (err.status === 422) {
      // Defence-in-depth on the backend rejected the postal code. Shouldn't
      // happen in the normal flow because the sign-up gate already checked.
      showToast("We're not in your area yet — please reach out if this is unexpected.");
    } else {
      showToast(err.message || 'Could not verify your locality.');
    }
  }
}
