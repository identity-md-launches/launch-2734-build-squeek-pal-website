import type { Action, Effects } from "./game";
import type { SaveState } from "./state";

/** What the widget and panel need, whether the reducer runs in a worker or in the page. */
export interface PalStore {
  get(): SaveState | null;
  dispatch(action: Action): Promise<Effects>;
  subscribe(fn: (s: SaveState) => void): () => void;
}
