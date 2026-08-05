import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, login, authHeaders } from './common.js';

// PRD 4.6: Register filter/sort must respond within 1s.
export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

// A handful of realistic Register interactions — filter combos, free-text
// search, and sort — cycled per iteration rather than hammering one exact
// query, since that's closer to how the page is actually used.
const QUERIES = [
  'stat=st-open,st-inprogress&sort=createdAt&dir=desc&page=1&pageSize=25',
  'disc=disc-ars,disc-mep&prio=pr-high,pr-critical&sort=dueDate&dir=asc&page=1&pageSize=25',
  'q=pipa&sort=createdAt&dir=desc&page=1&pageSize=25',
  'overdue=1&sort=dueDate&dir=asc&page=1&pageSize=25',
  'zone=zone-1,zone-2,zone-3&stat=st-resolved&sort=priority&dir=desc&page=2&pageSize=25',
];

export function setup() {
  return { token: login() };
}

export default function (data) {
  const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const res = http.get(`${BASE_URL}/clashes?${query}`, authHeaders(data.token));

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has data array': (r) => Array.isArray(r.json('data')),
  });

  sleep(0.5);
}
