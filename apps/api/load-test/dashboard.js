import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, login, authHeaders } from './common.js';

// PRD 4.6: Dashboard must load within 3s for a project up to 10,000 clash.
export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const token = login();
  // Matches DashboardView.tsx's "90d" range preset — full ISO instants,
  // not the plain YYYY-MM-DD dates /clashes uses (see HANDOFF.md §9.17).
  const to = new Date();
  const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  return { token, from: from.toISOString(), to: to.toISOString() };
}

export default function (data) {
  const res = http.get(
    `${BASE_URL}/clashes/metrics?from=${encodeURIComponent(data.from)}&to=${encodeURIComponent(data.to)}`,
    authHeaders(data.token),
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has totalClash': (r) => r.json('totalClash') !== undefined,
  });

  sleep(0.5);
}
