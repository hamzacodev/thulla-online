"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export interface AuthState {
  loading: boolean;
  userId: string | null;
  email: string | null;
  username: string | null; // null until they've picked one
  displayName: string | null; // from sign-up; may be null for older accounts
  accessToken: string | null;
}

const initial: AuthState = {
  loading: true,
  userId: null,
  email: null,
  username: null,
  displayName: null,
  accessToken: null,
};

export function useAuth() {
  const [state, setState] = useState<AuthState>(initial);

  async function loadProfile(userId: string, email: string | undefined, accessToken: string) {
    // `display_name` only exists once the schema migration has been run.
    // Fall back to the original shape so an un-migrated project still signs
    // people in rather than looking like a broken login.
    let data: { username?: string | null; display_name?: string | null } | null = null;
    const full = await supabase.from("profiles").select("username, display_name").eq("id", userId).single();
    if (full.error) {
      const basic = await supabase.from("profiles").select("username").eq("id", userId).single();
      data = basic.data;
    } else {
      data = full.data;
    }

    setState({
      loading: false,
      userId,
      email: email ?? null,
      // `username` is the handle other players see and gates online play.
      // `displayName` is the name given at sign-up — a friendlier fallback
      // for screens that just need something to call you.
      username: data?.username ?? null,
      displayName: data?.display_name ?? null,
      accessToken,
    });
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const session = data.session;
      if (session?.user) {
        loadProfile(session.user.id, session.user.email, session.access_token);
      } else {
        setState({ ...initial, loading: false });
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        loadProfile(session.user.id, session.user.email, session.access_token);
      } else {
        setState({ ...initial, loading: false });
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return state;
}
