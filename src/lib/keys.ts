// Key and modifier constants, with no Node imports so the keyboard island can
// use them in the browser. data.ts re-exports them for the build.

export const MODIFIERS = ["bare", "shift", "ctrl", "alt"] as const;
export type Modifier = (typeof MODIFIERS)[number];

export const MODIFIER_LABEL: Record<Modifier, string> = {
	bare: "Bare",
	shift: "Shift",
	ctrl: "Ctrl",
	alt: "Alt",
};

export const KEYS = [
	"`",
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"Q",
	"E",
	"R",
	"T",
	"Y",
	"F",
	"G",
	"H",
	"Z",
	"X",
	"C",
	"V",
	"B",
] as const;
export type Key = (typeof KEYS)[number];

/** Number-row keys: the only keys the action bars page by stance. */
export const PAGED_KEYS: readonly Key[] = ["1", "2", "3", "4", "5", "6"];

export const ALT_KEYS: readonly Key[] = ["R"];

export const canBind = (key: string, mod: Modifier): boolean =>
	mod !== "alt" || (ALT_KEYS as readonly string[]).includes(key);

/** `F`, `Shift+F`. Callers uppercase with CSS where the design wants caps. */
export const combo = (mod: Modifier, key: string, sep = "+"): string =>
	mod === "bare" ? key : `${MODIFIER_LABEL[mod]}${sep}${key}`;
