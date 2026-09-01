"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

/**
 * Profile pictures for a set of players, keyed by user id.
 *
 * Looked up rather than carried in the room state: profiles are publicly
 * readable, so this is one small select, and a player who changes their
 * picture shows up correctly at the next table without anything having to
 * rewrite rooms that are already in flight.
 *
 * If the `avatar_url` migration hasn't been run the select simply fails and
 * everyone keeps their initials, which is a fine table to sit at.
 */
export function useAvatars(ids: Array<string | null | undefined>): Record<string, string> {
  const [avatars, setAvatars] = useState<Record<string, string>>({});

  // A stable key, so re-rendering with an equal-but-new array is free.
  const key = Array.from(new Set(ids.filter((id): id is string => !!id)))
    .sort()
    .join(",");

  useEffect(() => {
    if (!key) return;
    let active = true;

    supabase
      .from("profiles")
      .select("id, avatar_url")
      .in("id", key.split(","))
      .then(({ data }) => {
        if (!active || !data) return;
        const next: Record<string, string> = {};
        data.forEach((row: { id: string; avatar_url: string | null }) => {
          if (row.avatar_url) next[row.id] = row.avatar_url;
        });
        setAvatars(next);
      });

    return () => {
      active = false;
    };
  }, [key]);

  return avatars;
}
