import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, login, authHeaders } from './common.js';

// PRD 4.6: Export (Excel/PDF) must finish within 10s for 10,000 rows.
// RegisterView.tsx's export buttons fetch the full filtered result set via
// this same /clashes endpoint with pageSize=10000 (see HANDOFF.md §5
// "GET /clashes sekarang filter/sort/pagination server-side") rather than a
// separate unpaginated export route — this measures exactly that request,
// not the client-side Excel/PDF generation that follows it.
export const options = {
  vus: 2,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<10000'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  return { token: login() };
}

export default function (data) {
  const res = http.get(`${BASE_URL}/clashes?page=1&pageSize=10000`, authHeaders(data.token));

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has data array': (r) => Array.isArray(r.json('data')),
  });

  sleep(1);
}
