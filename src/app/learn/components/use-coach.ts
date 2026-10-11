"use client";

import { useCallback, useRef, useState } from "react";
import type { CoachRequestBody, CoachRouteError } from "@/lib/learn/coach-types";
import { requestCoach } from "@/lib/learn/coach-client";

export type CoachSheetState =
  | { status: "loading"; title: string }
  | { status: "ready"; title: string; text: string }
  | { status: "error"; title: string; code: CoachRouteError };

/**
 * Drives the CoachSheet: `ask()` opens the sheet in its loading state, then
 * fills it with the reply or an error; `close()` dismisses it. A reply that
 * arrives after `close()` (or after a newer `ask()`) is ignored.
 */
export function useCoach(slug: string) {
  const [state, setState] = useState<CoachSheetState | null>(null);
  const requestId = useRef(0);

  const ask = useCallback(
    async (title: string, body: Omit<CoachRequestBody, "slug">) => {
      const id = ++requestId.current;
      setState({ status: "loading", title });
      const res = await requestCoach({ slug, ...body });
      if (id !== requestId.current) return;
      if (res.ok && "text" in res) setState({ status: "ready", title, text: res.text });
      else setState({ status: "error", title, code: res.ok ? "error" : res.error });
    },
    [slug]
  );

  const close = useCallback(() => {
    requestId.current += 1;
    setState(null);
  }, []);

  return { state, ask, close };
}
