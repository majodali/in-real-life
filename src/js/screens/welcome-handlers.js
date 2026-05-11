// Pure routing handler for the welcome screen.
//
// Calls GET /me, decides where to send the user based on the response,
// and registers the aggregate when the user is brand new (404). Lives
// here rather than in welcome.js so the decision tree is unit-testable
// without touching the DOM.
//
// Routing matrix:
//   200 + name + localityVerified → saveUser(me) + feed
//   200 + name + !localityVerified → locality
//   200 + no name                 → onboarding (registered, no profile yet)
//   404                           → register, then onboarding
//   401                           → signin (session lost)
//   anything else                 → toast, stay on screen

export async function handleWelcomeMount({ api, commands, navigate, showToast, saveUser }) {
  let me;
  try {
    me = await api.get('/me');
  } catch (err) {
    if (err.status === 401) {
      navigate('signin');
      return;
    }
    if (err.status === 404) {
      try {
        await commands.register();
      } catch (regErr) {
        showToast(regErr.message || 'Could not set up your account.');
        return;
      }
      navigate('onboarding');
      return;
    }
    showToast(err.message || 'Could not load your account.');
    return;
  }

  if (!me.name) {
    navigate('onboarding');
    return;
  }

  if (!me.localityVerified) {
    navigate('locality');
    return;
  }

  saveUser(me);
  navigate('feed');
}
