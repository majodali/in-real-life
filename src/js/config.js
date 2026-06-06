// ─── App configuration ───
//
// Per-environment values come from a small inline <script> block in
// app.html that sets window.__IRL_CONFIG__ before this module loads.
// The deploy tooling (ops repo) generates that block from CDK outputs.
//
// For local development, copy app.html → app.local.html (or edit in
// place if you don't mind not committing it) and paste the same inline
// block with values pointing at whichever stack you're hitting. Defaults
// below throw a loud error so a forgotten deploy step is obvious instead
// of silently sending requests to ''.

const provided =
  (typeof globalThis !== 'undefined' && globalThis.__IRL_CONFIG__) || null;

function required(key) {
  if (!provided || !provided[key]) {
    throw new Error(
      `Missing runtime config "${key}". The deploy step did not inject ` +
      `window.__IRL_CONFIG__ into app.html. See docs in the ops repo.`,
    );
  }
  return provided[key];
}

export const API_BASE_URL = required('apiBaseUrl');
export const COGNITO_REGION = provided?.cognitoRegion ?? 'us-east-1';
export const COGNITO_USER_POOL_ID = required('cognitoUserPoolId');
export const COGNITO_USER_POOL_CLIENT_ID = required('cognitoUserPoolClientId');
export const FEEDBACK_URL = required('feedbackUrl');
