// Pure logic for the onboarding screen.
//
// The live interview loop (POST /me/interview/turn) and the completion
// sequence (profile basics → onboarding extraction) live here so they can
// be unit-tested; DOM access stays in onboarding.js. The scripted flow in
// data.js remains as the fallback when the live API is unreachable — the
// dev personas and offline preview keep working.

// One exchange = the card the interviewer showed + what the member said.
export function appendExchange(transcript, prompt, answer) {
  return [
    ...transcript,
    { role: 'interviewer', text: prompt },
    { role: 'member', text: answer },
  ];
}

// The scripted fallback still produces a transcript so completion can run
// the same extraction path. The name question is a form field, not
// interview content (D42 basics-only), and skipped/empty answers carry no
// signal — both are left out.
export function scriptedResponsesToTranscript(responses) {
  const transcript = [];
  for (const r of responses ?? []) {
    if (!r || r.questionId === 'name') continue;
    const answer = (r.response ?? '').trim();
    if (!answer) continue;
    transcript.push({ role: 'interviewer', text: r.questionText });
    transcript.push({ role: 'member', text: answer });
  }
  return transcript;
}

// Fetch the next card. Returns { turn } on success or { error } — the
// screen decides whether that means "fall back to scripted" (first turn)
// or "offer a retry" (mid-interview).
export async function handleInterviewTurn({ transcript, commands }) {
  try {
    const turn = await commands.interviewTurn({ transcript });
    return { turn };
  } catch (error) {
    return { error };
  }
}

// The completion sequence, in the event-sourcing order: profile basics
// (UserProfileCreated, seq n+1) then the interview close (OnboardingCompleted,
// seq n+2). A 409 from either means a previous attempt already landed that
// step — converge and keep going rather than stranding the user.
export async function handleOnboardingDone({
  name,
  avatar,
  vibeMessage,
  transcript,
  commands,
  navigate,
  showToast,
}) {
  try {
    await commands.createProfile({ name, avatar, vibeMessage });
  } catch (err) {
    if (err.status === 404) {
      showToast('Account not registered yet — please sign in again.');
      navigate('signin');
      return false;
    }
    if (err.status !== 409) {
      showToast(err.message || 'Could not save your profile.');
      return false;
    }
    // 409: profile already exists — fine, continue to the interview close.
  }

  if (transcript.length > 0) {
    try {
      await commands.completeOnboarding({ transcript });
    } catch (err) {
      if (err.status !== 409) {
        // The profile is saved; don't strand the user over the extraction.
        // The transcript is lost, but understanding grows from debriefs —
        // losing the seed is recoverable, losing the member is not.
        showToast('We saved your profile, but couldn’t finish the interview notes.');
      }
      // 409: onboarding already completed — converge silently.
    }
  }

  navigate('locality');
  return true;
}
