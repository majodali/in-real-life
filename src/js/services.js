// ─── Service singletons ───
//
// Constructed once per page load. Screens import these directly so we don't
// scatter `createAuth` / `createApi` calls. Tests pass mocks instead.

import { createAuth } from './auth.js';
import { createApi } from './api.js';
import { createCommands } from './commands.js';
import {
  API_BASE_URL,
  COGNITO_REGION,
  COGNITO_USER_POOL_CLIENT_ID,
} from './config.js';

export const auth = createAuth({
  region: COGNITO_REGION,
  userPoolClientId: COGNITO_USER_POOL_CLIENT_ID,
});

export const api = createApi({
  baseUrl: API_BASE_URL,
  auth,
});

export const commands = createCommands({ api });
