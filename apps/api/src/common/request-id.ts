import { randomUUID } from 'crypto';

// Same shape as randomUUID()/anything else we'd generate ourselves — bounds
// what a client-supplied X-Request-Id can put into logs (no newlines, no
// unbounded length) without banning a legitimate caller's own trace id.
const VALID_REQUEST_ID = /^[a-zA-Z0-9-]{1,64}$/;

/** Trusts an inbound X-Request-Id only if it's already a safe, bounded
 * token; otherwise mints a fresh one. Exported standalone (rather than
 * inlined in app.module.ts's pinoHttp.genReqId) so the validation logic is
 * unit-testable without booting Nest. */
export function resolveRequestId(inboundHeader: string | string[] | undefined): string {
  const candidate = Array.isArray(inboundHeader) ? inboundHeader[0] : inboundHeader;
  return candidate && VALID_REQUEST_ID.test(candidate) ? candidate : randomUUID();
}
