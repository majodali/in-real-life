// Pure logic for the agreement re-acceptance screen.
//
// Reached when GET /me flags requiresAgreementReacceptance (the required
// Terms of Use version moved past the one this member accepted). Until
// they re-accept, the backend rejects state-changing commands with
// agreement_reacceptance_required — so the only ways off this screen are
// accepting or signing out.

// Load the screen's facts. Navigates away (and returns null) when the
// member doesn't actually need to be here.
export async function handleAgreementMount({ api, navigate, showToast }) {
  let me;
  try {
    me = await api.get('/me');
  } catch (err) {
    if (err.status === 401) {
      navigate('signin');
      return null;
    }
    showToast(err.message || 'Could not load your account.');
    return null;
  }

  if (!me.requiresAgreementReacceptance) {
    navigate('welcome');
    return null;
  }
  return { requiredAgreementVersion: me.requiredAgreementVersion };
}

// Accept the required version. A 409 means another session (or a retried
// command) already accepted — converge, don't strand.
export async function handleAgreementAccept({
  agreementVersion,
  commands,
  navigate,
  showToast,
}) {
  try {
    await commands.reacceptAgreement({ agreementVersion });
  } catch (err) {
    if (err.status !== 409) {
      showToast(err.message || 'Could not record your acceptance.');
      return false;
    }
  }
  navigate('welcome');
  return true;
}
