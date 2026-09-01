/**
 * Two registers of the same UI. "en" keeps the desi flavour to a light
 * seasoning so a non-Urdu speaker is never lost; "ur" (Roman Urdu) leans in.
 * Nothing here is load-bearing — every string has a plain-English fallback
 * meaning, and game-critical information is always also shown as data
 * (card counts, names, turn indicator) rather than only as a phrase.
 */
export type Lang = "en" | "ur";

type Str = { en: string; ur: string };
type Fn = (...args: never[]) => Str;

const S = (en: string, ur: string): Str => ({ en, ur });

export const copy = {
  tagline: S("The desi card game", "Desi card game — asli maza"),
  hook: S(
    "Dekhte hain aaj Thulla kis ko parta hai!",
    "Dekhte hain aaj Thulla kis ko parta hai!"
  ),

  play: S("Play Game", "Game Khelo"),
  playCpu: S("Play vs Computer", "Computer ke saath"),
  playFriends: S("Play with Friends", "Doston ke saath"),
  howToPlay: S("How to Play", "Kaise Khelein"),
  profile: S("Profile", "Profile"),
  settings: S("Settings", "Settings"),
  signOut: S("Sign out", "Log out"),
  home: S("Home", "Home"),
  back: S("Back", "Wapas"),

  gameStart: S("Chalo bhai, game shuru!", "Chalo bhai, game shuru!"),
  shuffling: S("Shuffling…", "Patte mil rahe hain…"),
  dealing: S("Dealing…", "Baant raha hoon…"),
  yourTurn: S("Your turn", "Tumhari baari hai!"),
  yourTurnHint: S("Pick a card", "Koi patta chuno"),
  waitingFor: S("Waiting for", "Intezaar"),
  thinking: S("thinking", "zara sochnay do"),
  cards: S("cards", "patte"),
  out: S("Out", "Nikal gaya"),
  safe: S("Safe", "Bach gaya"),

  aceFound: S("Ace of Spades found!", "Hukum ka Ikka mil gaya!"),
  aceStarts: S("starts the round", "shuru karega"),
  mustLeadAce: S("You must lead the Ace of Spades", "Hukum ka Ikka chalna hoga"),

  trickWon: S("wins the trick!", "ne trick jeet li!"),
  trickWonYou: S("Wah ji wah! Trick jeet li!", "Wah ji wah! Trick jeet li!"),
  pickedUp: S("picks up the pile", "ne saare patte utha liye"),
  pickedUpYou: S("Oho! You picked up the pile", "Oho! Saare patte tumhare"),
  couldNotFollow: S("couldn't follow suit", "ke paas suit nahi tha"),

  bhabhiIs: S("is the Bhabhi!", "Bhabhi ban gaya!"),
  bhabhiYou: S("Ohooo! You're the Bhabhi", "Ohooo! Bhabhi ban gaye"),
  winner: S("Winner", "Jeet gaya"),
  gameOver: S("Game Over", "Khel khatam"),
  greatGame: S("Kya game thi boss!", "Kya game thi boss!"),
  rematch: S("Rematch", "Dobara ho jaye?"),
  newGame: S("New Game", "Naya Game"),

  errGeneric: S("Oops! Something went sideways.", "Oops! Kuch masla ho gaya"),
  errRetry: S("Give it another go.", "Dobara koshish karo"),
} satisfies Record<string, Str | Fn>;

export type CopyKey = keyof typeof copy;

export function t(key: CopyKey, lang: Lang): string {
  return copy[key][lang];
}

/** Phrases that take a name, kept separate so they stay type-safe. */
export const phrase = {
  /** `isYou` switches to the second person — "You start", not "You starts". */
  startsRound: (name: string, lang: Lang, isYou = false) =>
    isYou
      ? lang === "ur"
        ? "Tum shuru karo!"
        : "You start the round"
      : lang === "ur"
      ? `${name} shuru karega`
      : `${name} starts the round`,
  wonTrick: (name: string, lang: Lang) =>
    lang === "ur" ? `${name} ne trick jeet li!` : `${name} wins the trick!`,
  pickedUp: (name: string, n: number, lang: Lang) =>
    lang === "ur"
      ? `${name} ne ${n} patte utha liye`
      : `${name} picks up ${n} card${n === 1 ? "" : "s"}`,
  isThinking: (name: string, lang: Lang) =>
    lang === "ur" ? `${name} soch raha hai…` : `${name} is thinking…`,
  isBhabhi: (name: string, lang: Lang) =>
    lang === "ur" ? `${name} Bhabhi ban gaya!` : `${name} is the Bhabhi!`,
  waitingFor: (name: string, lang: Lang) =>
    lang === "ur" ? `${name} ka intezaar…` : `Waiting for ${name}…`,
  isOut: (name: string, lang: Lang) =>
    lang === "ur" ? `${name} bach gaya!` : `${name} is out — safe!`,
};

/** Light-hearted rejections for an illegal tap. Rotated so it doesn't nag. */
const INVALID_EN = [
  "Oye! Same suit hai — follow the suit.",
  "Aray bhai, ye card nahi chal sakta.",
  "Not that one — you still have the led suit.",
];
const INVALID_UR = [
  "Oye! Same suit hai — suit follow karo.",
  "Aray bhai, ye card nahi chal sakta 😄",
  "Ye nahi chalega — led suit abhi baaki hai.",
];

export function invalidCardMessage(lang: Lang, nth: number): string {
  const pool = lang === "ur" ? INVALID_UR : INVALID_EN;
  return pool[nth % pool.length];
}
