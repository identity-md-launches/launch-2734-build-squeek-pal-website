// Sharing opens X's own compose window. The user decides whether to post.
export function intentUrl(text: string, url: string): string {
  const q = new URLSearchParams({ text });
  if (url) q.set("url", url);
  return `https://x.com/intent/post?${q.toString()}`;
}
