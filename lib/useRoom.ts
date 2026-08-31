"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { GameState } from "./types";

export function useRoom(code: string | null) {
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    let active = true;
    setLoading(true);

    supabase
      .from("rooms")
      .select("state")
      .eq("code", code)
      .single()
      .then(({ data }) => {
        if (active && data) setState(data.state as GameState);
        setLoading(false);
      });

    const channel = supabase
      .channel(`room-${code}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `code=eq.${code}` },
        (payload) => {
          setState(payload.new.state as GameState);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [code]);

  return { state, loading };
}
