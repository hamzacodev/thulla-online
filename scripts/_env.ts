/**
 * Placeholder Supabase credentials for the headless suites.
 *
 * `lib/roomFlow` builds an admin client at module scope for writing results,
 * which throws on import without a URL — even for the pure rules functions a
 * test wants. These values are never connected to: nothing in a test writes.
 * Import this before anything that reaches into `lib/supabaseAdmin`.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";

export {};
