"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type { RoomState } from "./roomTypes";

/**
 * Live room state. The initial fetch and the realtime subscription are set
 * up together so a client that joins mid-game still sees the current table,
 * not just the next change.
 */
export function useRoom(code: string | null) {
  const [state, setState] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    if (!code) return;
    const { data } = await supabase.from("rooms").select("state").eq("code", code).maybeSingle();
    if (data?.state) setState(data.state as RoomState);
  }, [code]);

  useEffect(() => {
    if (!code) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the fetch in flight before subscribing to room updates
    setLoading(true);
    setNotFound(false);

    supabase
      .from("rooms")
      .select("state")
      .eq("code", code)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        if (data?.state) setState(data.state as RoomState);
        else setNotFound(true);
        setLoading(false);
      });

    const channel = supabase
      .channel(`room-${code}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `code=eq.${code}` },
        (payload) => {
          if (active) setState(payload.new.state as RoomState);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [code]);

  return { state, loading, notFound, refresh };
}
