import http from 'k6/http';

// The API runs natively on the host (npm run start:dev), not in a
// container, so it can be edited/restarted between k6 runs without
// rebuilding an image. k6 itself runs via `docker run grafana/k6`, so it
// reaches the host through Docker Desktop's host.docker.internal DNS name,
// not localhost (which inside the container would mean the k6 container
// itself).
export const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:3001/api';

const LOGIN_EMAIL = __ENV.LOGIN_EMAIL || 'coordinator@clashhub.dev';
const LOGIN_PASSWORD = __ENV.LOGIN_PASSWORD || 'demo1234';

/** Runs once per k6 test run (not per VU) — see each script's setup(). */
export function login() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 200) {
    throw new Error(`Login gagal (${res.status}): ${res.body}`);
  }
  return res.json('accessToken');
}

export function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}
