// Every selector that touches X's markup lives here, with fallbacks in order.
// If none match, chests are simply not placed; the pal and popup keep working.

export const SELECTORS = {
  tweet: ['article[data-testid="tweet"]', 'article[role="article"]', '[role="article"]'],
  tweetText: ['[data-testid="tweetText"]', "div[lang]"],
  actionRow: ['div[role="group"]'],
};

export function findTweets(root: ParentNode): Element[] {
  for (const sel of SELECTORS.tweet) {
    try {
      const found = Array.from(root.querySelectorAll(sel));
      if (found.length) return found;
    } catch {
      /* invalid selector after an edit: try the next one */
    }
  }
  return [];
}

function first(el: Element, list: string[]): Element | null {
  for (const sel of list) {
    try {
      const found = el.querySelector(sel);
      if (found) return found;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Visible post text only, never hidden fields, links or metadata. */
export function tweetText(tweet: Element): string {
  const el = first(tweet, SELECTORS.tweetText) as HTMLElement | null;
  return el ? (el.innerText ?? el.textContent ?? "") : "";
}

export function actionRow(tweet: Element): Element | null {
  const rows = SELECTORS.actionRow.flatMap((sel) => {
    try {
      return Array.from(tweet.querySelectorAll(sel));
    } catch {
      return [];
    }
  });
  return rows.length ? rows[rows.length - 1] : null;
}
