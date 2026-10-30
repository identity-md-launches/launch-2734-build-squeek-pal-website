// Sample posts for the demo timeline. Fictional accounts; marked as samples on the page.
// The markup mirrors the selectors in shared/selectors.ts so the real chest placer runs on it.
import { esc } from "../../shared/ui";
import type { Lang } from "../../shared/state";
import { st } from "./strings";

const AUTHORS = [
  ["Mika Tran", "mikabuilds"],
  ["Ola Berg", "olaberg"],
  ["Sam Ortiz", "sam_ships"],
  ["Linh Pham", "linhcodes"],
  ["Jun Park", "junpark"],
  ["Ada Novak", "adanovak"],
];

const TEXTS = [
  "Morning walk done. Coffee number two is loading.",
  "Watching the $SQK wheel stats over breakfast. Tiny legs, big numbers.",
  "Shipping a small fix today. Small fixes are underrated.",
  "Is it a toychain if the miner is a hamster? Asking for Squeekchain.",
  "Rain all week. Perfect weather for refactoring.",
  "Hot take: the best UI is the one you forget is there.",
  "Reading about proof-of-work on #Squeekchain and smiling at my desk.",
  "Plant update: the basil survived another week.",
  "Note to self: write the test first next time.",
  "Pixel art is just patience with a grid.",
  "Who else checks @squeekchain before email?",
  "Lunch: noodles. Mood: noodles.",
  "Debugging by talking to a rubber duck. The duck is winning.",
  "Took the long way home and found a new bakery.",
  "Sunflower seeds are an elite snack, I said what I said.",
  "Three meetings, one decision. Progress.",
];

let n = 0;

export function samplePosts(count: number, lang: Lang = "en"): string {
  let html = "";
  for (let i = 0; i < count; i++, n++) {
    const [name, handle] = AUTHORS[n % AUTHORS.length];
    const text = TEXTS[(n * 7) % TEXTS.length];
    const mins = (n % 59) + 1;
    html += `<article data-testid="tweet" class="post" aria-label="${esc(name)}">
      <div class="avatar" aria-hidden="true" style="--h:${(n * 47) % 360}"></div>
      <div class="post-body">
        <p class="post-head"><b>${esc(name)}</b> <span class="muted">@${handle} · ${mins}m</span></p>
        <div data-testid="tweetText" lang="en">${esc(text)}</div>
        <div role="group" class="post-actions" aria-label="${st(lang, "postActions")}"><span>${st(lang, "reply")}</span><span>${st(lang, "repost")}</span><span>${st(lang, "like")}</span></div>
      </div>
    </article>`;
  }
  return html;
}
