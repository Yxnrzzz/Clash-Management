"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "./api/client";

/**
 * Signed URLs expire 5 minutes after being issued (see StorageService on the
 * API). Refreshing 1 minute early — rather than waiting for a 403 — means an
 * open preview modal or a long-lived thumbnail never visibly breaks.
 */
const REFRESH_MARGIN_MS = 60_000;
const MIN_DELAY_MS = 5_000;

interface Resolved {
  attachmentId: string | null;
  url: string | null;
  error: boolean;
}

/**
 * Fetches (and proactively refreshes) a short-lived signed URL for one
 * attachment. Deliberately does NOT lengthen the TTL server-side to solve
 * the "open tab for a while" problem — a signed URL is unrevocable once
 * issued, so a longer window is strictly more exposure for no UX gain over
 * this timer.
 */
export function useSignedUrl(
  clashId: string,
  attachmentId: string | null
): { url: string | null; error: boolean; refresh: () => void } {
  const [resolved, setResolved] = useState<Resolved>({
    attachmentId: null,
    url: null,
    error: false,
  });
  // Bumped to force a refetch of the same attachmentId (scheduled refresh,
  // or a manual retry) without needing to call itself from inside its own
  // effect closure.
  const [tick, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which attachmentId manual refresh() has already been used for.
  // Deliberately NOT reset on a successful fetch — an <img onError> firing
  // because the underlying file itself is undecodable (not because the URL
  // expired) would otherwise re-arm the retry on every successful re-mint
  // and loop forever, hammering the signed-url endpoint until it 429s.
  const retriedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!attachmentId) return;
    let cancelled = false;

    apiGet<{ url: string; expiresAt: number }>(
      `/clashes/${clashId}/attachments/${attachmentId}/signed-url`
    )
      .then(({ url: path, expiresAt }) => {
        if (cancelled) return;
        setResolved({ attachmentId, url: `/api${path}`, error: false });
        const delay = Math.max(expiresAt - Date.now() - REFRESH_MARGIN_MS, MIN_DELAY_MS);
        timerRef.current = setTimeout(() => setTick((t) => t + 1), delay);
      })
      .catch(() => {
        if (!cancelled) setResolved((r) => ({ ...r, attachmentId, error: true }));
      });

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [clashId, attachmentId, tick]);

  // Manual retry path (e.g. an <img onError>) — at most once per
  // attachmentId, ever, regardless of how many times the retry itself
  // succeeds-but-still-fails-to-render.
  const refresh = useCallback(() => {
    if (!attachmentId || retriedForRef.current === attachmentId) return;
    retriedForRef.current = attachmentId;
    setTick((t) => t + 1);
  }, [attachmentId]);

  // Derived at render time rather than reset via a synchronous setState in
  // an effect: if the last resolved entry doesn't match the attachmentId
  // currently requested, treat it as "not loaded yet" for this id.
  const isStale = resolved.attachmentId !== attachmentId;
  return {
    url: isStale ? null : resolved.url,
    error: isStale ? false : resolved.error,
    refresh,
  };
}
