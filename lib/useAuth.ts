"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export interface AuthState {
  loading: boolean;
  userId: string | null;
  email: string | null;
  username: string | null; // null until they've picked one
  accessToken: string | null;
}

const initial: AuthState = { loading: true, userId: null, email: null, username: null, accessToken: null };

export function useAuth() {
  const [state, setState] = useState<AuthState>(initial);

  async function loadProfile(userId: string, email: string | undefined, accessToken: string) {
    const { data } = await supabase.from("profiles").select("username").eq("id", userId).single();
    setState({
      loading: false,
      userId,
      email: email ?? null,
      username: data?.username ?? null,
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
