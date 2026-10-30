// Shop catalogue: 3 foods, 3 toys, 4 hats, 3 wheel skins. Prices are in Seeds,
// an in-game counter that only exists on this device.

export type ItemKind = "food" | "toy" | "hat" | "wheel";

export interface Item {
  id: string;
  kind: ItemKind;
  price: number;
  /** food: hunger restored; toy: extra happiness per play */
  power?: number;
  /** palette colours used by the pixel art */
  colors?: string[];
}

export const ITEMS: Item[] = [
  { id: "sunflower", kind: "food", price: 4, power: 15 },
  { id: "carrot", kind: "food", price: 8, power: 25 },
  { id: "yogurt", kind: "food", price: 14, power: 40 },
  { id: "chew", kind: "toy", price: 20, power: 6 },
  { id: "ball", kind: "toy", price: 30, power: 9 },
  { id: "tunnel", kind: "toy", price: 45, power: 12 },
  { id: "acorn", kind: "hat", price: 25, colors: ["#8a5a2b", "#c98b45"] },
  { id: "beanie", kind: "hat", price: 35, colors: ["#3b7dd8", "#f2f2f2"] },
  { id: "party", kind: "hat", price: 50, colors: ["#e0457b", "#ffd447"] },
  { id: "crown", kind: "hat", price: 90, colors: ["#f2b705", "#fff1a8"] },
  { id: "mint", kind: "wheel", price: 30, colors: ["#3fb68b", "#bff0dc"] },
  { id: "sunset", kind: "wheel", price: 45, colors: ["#e8743b", "#ffd0a8"] },
  { id: "golden", kind: "wheel", price: 120, colors: ["#d4a017", "#fff0a0"] },
];

export const DEFAULT_WHEEL_COLORS = ["#8c8c96", "#d9d9e0"];

export function itemById(id: string): Item | undefined {
  return ITEMS.find((i) => i.id === id);
}

export function itemsOfKind(kind: ItemKind): Item[] {
  return ITEMS.filter((i) => i.kind === kind);
}
