// Lookups shared by the keyboard island and the static tables. Type-only
// imports from data.ts, so nothing from Node reaches the browser.
import type {
	Macro,
	ResolvedBinding,
	ResolvedCharacter,
	ResolvedSlot,
} from "./data";
import {
	combo,
	KEYS,
	type Key,
	MODIFIERS,
	type Modifier,
	PAGED_KEYS,
} from "./keys";

export const slotAt = (
	c: ResolvedCharacter,
	key: string,
	mod: Modifier,
): ResolvedSlot | undefined => c.keys[key as Key]?.[mod];

/** What sits on key + modifier in a stance. Null means the key is open. */
export function bindingAt(
	c: ResolvedCharacter,
	key: string,
	mod: Modifier,
	stance: string,
): ResolvedBinding | null {
	const slot = slotAt(c, key, mod);
	if (!slot) return null;
	return slot.stances ? (slot.stances[stance] ?? null) : (slot.binding ?? null);
}

/** The number row pages with stance, but only for characters that have stances. */
export const isPaged = (c: ResolvedCharacter, key: string): boolean =>
	c.stances.length > 0 && (PAGED_KEYS as readonly string[]).includes(key);

/** `Def`, `Bat`, `Ber`: the segmented control and the key stack use these. */
export const stanceShort = (label: string): string => label.slice(0, 3);

/** Every key the macro is on, in keyboard order: `Shift+F`, `Ctrl+V · Defensive`. */
export function macroKeys(
	c: ResolvedCharacter,
	macro: Macro["name"],
): string[] {
	const out: string[] = [];
	for (const key of KEYS) {
		for (const mod of MODIFIERS) {
			const slot = slotAt(c, key, mod);
			if (!slot) continue;
			if (slot.binding?.macro === macro) out.push(combo(mod, key));
			if (!slot.stances) continue;
			const hits = c.stances.filter(
				(s) => slot.stances?.[s.id]?.macro === macro,
			);
			if (hits.length === c.stances.length) out.push(combo(mod, key));
			else if (hits.length)
				out.push(`${combo(mod, key)} · ${hits.map((s) => s.label).join(", ")}`);
		}
	}
	return out;
}
