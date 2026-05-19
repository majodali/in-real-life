// Authenticated API client.
//
// Thin wrapper around fetch that attaches a Bearer token from the auth
// module, parses JSON, and on 401 tries to refresh-and-retry once. See
// api.test.mjs for the spec.

export function createApi({ baseUrl, auth, fetch = globalThis.fetch }) {
  async function request(method, path, body) {
    const initialToken = await auth.getValidIdToken();
    let response = await sendOnce(method, path, body, initialToken);

    if (response.status === 401 && initialToken) {
      try {
        const refreshed = await auth.refresh();
        response = await sendOnce(method, path, body, refreshed.idToken);
      } catch {
        // Fall through and surface the original 401 below.
      }
    }

    if (response.status === 204) return null;

    let parsed = null;
    try { parsed = await response.json(); } catch { /* non-JSON body */ }

    if (!response.ok) {
      const err = new Error(parsed?.error || `HTTP ${response.status}`);
      err.status = response.status;
      err.body = parsed;
      throw err;
    }

    return parsed;
  }

  async function sendOnce(method, path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    delete: (path, body) => request('DELETE', path, body),
  };
}
