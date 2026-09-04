/**
 * Room codes, in one place.
 *
 * The alphabet leaves out I, O, 0 and 1 — a code gets read aloud down a
 * phone or typed off a photo, and those four are the ones people get wrong.
 */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;

const ALLOWED = new RegExp(`[^${ROOM_CODE_ALPHABET}]`, "g");

/**
 * Cleans up what somebody typed or pasted.
 *
 * Deliberately *not* called on every keystroke. A controlled input that
 * rewrites its own value mid-word fights the software keyboard on Android:
 * switching to the number layout replaces the composing region, and if React
 * hands back a different string at that moment the field empties. So this
 * runs when the field is left or submitted, and typing is left alone.
 */
export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(ALLOWED, "").slice(0, ROOM_CODE_LENGTH);
}

export function isCompleteRoomCode(code: string): boolean {
  return normalizeRoomCode(code).length === ROOM_CODE_LENGTH;
}
