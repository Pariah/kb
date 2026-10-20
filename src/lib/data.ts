// Loads and validates everything in src/data. One module so the build, the
// pages and `bun run validate` all enforce the same rules. Most rules span
// files (a binding's macro must exist, tab limits), which per-entry schemas
// can't see, so the cross-file checks run here after Zod parses each file.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

export const MODIFIERS = ["bare", "shift", "ctrl", "alt"] as const;
export type Modifier = (typeof MODIFIERS)[number];

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

const ALT_KEYS: readonly Key[] = ["R"];
const PREFIXES = [
	"Atk",
	"CD",
	"Equip",
	"Form",
	"Item",
	"Mark",
	"Pot",
	"Race",
	"Sys",
	"Tank",
	"Util",
];
/** Prefixes whose macros are normally run by hand, not from a key. */
const EXPECTED_UNBOUND = ["Equip", "Mark", "Sys"];
const LIMITS = { name: 16, body: 255, classTab: 30, generalTab: 120 };

// ── Schemas ───────────────────────────────────────────────────────────────

const slug = z.string().regex(/^[a-z][a-z0-9-]*$/, "use a lowercase slug");

const Binding = z.strictObject({
	ability: z.string().min(1),
	macro: z.string().optional(),
	/** Wowhead icon name, when this binding needs a different icon than icons.yaml gives the ability. */
	icon: z.string().optional(),
	locked: z.boolean().optional(),
	note: z.string().optional(),
});
export type Binding = z.infer<typeof Binding>;

const StanceSlot = z.strictObject({
	stances: z.record(z.string(), Binding),
	note: z.string().optional(),
});

const Slot = z.union([Binding, StanceSlot]);
type RawSlot = z.infer<typeof Slot>;

const Character = z.strictObject({
	name: z.string().min(1),
	class: slug,
	spec: z.string().optional(),
	race: z.string().optional(),
	role: z.enum(["main", "alt"]),
	stances: z
		.array(z.strictObject({ id: slug, label: z.string().min(1) }))
		.optional(),
	keys: z.record(z.string(), z.record(z.string(), Slot)),
});

const Macro = z.strictObject({
	tab: slug,
	note: z.string().optional(),
	// Block scalars can carry a trailing newline the game would count.
	body: z
		.string()
		.min(1)
		.transform((s) => s.replace(/\n+$/, "")),
});
export type Macro = z.infer<typeof Macro> & { name: string };

const Job = z.strictObject({
	label: z.string().min(1),
	classLabel: z.record(slug, z.string()).optional(),
	slots: z.record(z.string(), z.array(z.enum(MODIFIERS))),
});

const Icons = z.record(
	z.string(),
	z.string().regex(/^[a-z0-9_-]+$/, "Wowhead icon names are lowercase"),
);

// ── Resolved shapes (what pages and the island consume) ───────────────────

export interface Job {
	id: string;
	label: string;
}

export interface ResolvedBinding extends Omit<Binding, "icon"> {
	/** Icon file name in public/icons (without .jpg), or null if none is committed. */
	icon: string | null;
}

/** One key + modifier. `stances` is set when the ability changes with stance. */
export interface ResolvedSlot {
	job: Job | null;
	binding?: ResolvedBinding;
	stances?: Record<string, ResolvedBinding | null>;
}

export interface ResolvedCharacter {
	slug: string;
	name: string;
	class: string;
	spec?: string;
	race?: string;
	role: "main" | "alt";
	stances: { id: string; label: string }[];
	keys: Partial<Record<Key, Partial<Record<Modifier, ResolvedSlot>>>>;
}

export interface KbData {
	characters: ResolvedCharacter[];
	macros: Macro[];
	jobs: Job[];
}

export interface Issues {
	errors: string[];
	warnings: string[];
}

// ── Loading ───────────────────────────────────────────────────────────────

const DATA_DIR = join(process.cwd(), "src/data");
const ICON_DIR = join(process.cwd(), "public/icons");

function readYaml(path: string): unknown {
	return parse(readFileSync(path, "utf8"));
}

function zodErrors(file: string, error: z.ZodError): string[] {
	return error.issues.map(
		(i) => `${file}: ${i.path.join(".") || "(root)"}: ${i.message}`,
	);
}

const isStanceSlot = (s: RawSlot): s is z.infer<typeof StanceSlot> =>
	"stances" in s;

/** Parses and checks all data. Never throws; callers decide what errors mean. */
export function validate(): { data: KbData | null; issues: Issues } {
	const errors: string[] = [];
	const warnings: string[] = [];

	const macrosRaw = z
		.record(z.string(), Macro)
		.safeParse(readYaml(join(DATA_DIR, "macros.yaml")));
	const jobsRaw = z
		.record(slug, Job)
		.safeParse(readYaml(join(DATA_DIR, "jobs.yaml")));
	const iconsPath = join(DATA_DIR, "icons.yaml");
	const iconsRaw = Icons.safeParse(
		existsSync(iconsPath) ? (readYaml(iconsPath) ?? {}) : {},
	);
	if (!macrosRaw.success)
		errors.push(...zodErrors("macros.yaml", macrosRaw.error));
	if (!jobsRaw.success) errors.push(...zodErrors("jobs.yaml", jobsRaw.error));
	if (!iconsRaw.success)
		errors.push(...zodErrors("icons.yaml", iconsRaw.error));

	const characterFiles = readdirSync(join(DATA_DIR, "characters"))
		.filter((f) => f.endsWith(".yaml"))
		.sort();
	const charactersRaw = characterFiles.flatMap((file) => {
		const parsed = Character.safeParse(
			readYaml(join(DATA_DIR, "characters", file)),
		);
		if (parsed.success)
			return [{ slug: file.replace(/\.yaml$/, ""), file, ...parsed.data }];
		errors.push(...zodErrors(`characters/${file}`, parsed.error));
		return [];
	});

	if (!macrosRaw.success || !jobsRaw.success || !iconsRaw.success)
		return { data: null, issues: { errors, warnings } };

	// Macros: names, prefixes, lengths, tab limits.
	const macros: Macro[] = Object.entries(macrosRaw.data).map(([name, m]) => ({
		name,
		...m,
	}));
	const prefixRe = new RegExp(`^(${PREFIXES.join("|")}): \\S`);
	const tabCounts = new Map<string, number>();
	for (const m of macros) {
		if (m.name.length > LIMITS.name)
			errors.push(
				`macro "${m.name}": name is ${m.name.length} chars (max ${LIMITS.name})`,
			);
		if (!prefixRe.test(m.name))
			errors.push(
				`macro "${m.name}": name must be "Prefix: Name" with a known prefix`,
			);
		if (m.body.length > LIMITS.body)
			errors.push(
				`macro "${m.name}": body is ${m.body.length} chars (max ${LIMITS.body})`,
			);
		tabCounts.set(m.tab, (tabCounts.get(m.tab) ?? 0) + 1);
	}
	for (const [tab, count] of tabCounts) {
		const max = tab === "general" ? LIMITS.generalTab : LIMITS.classTab;
		if (count > max)
			errors.push(`macros: ${count} on the ${tab} tab (max ${max})`);
	}
	const macroByName = new Map(macros.map((m) => [m.name, m]));

	// Jobs: index slots so each key + modifier maps to at most one job.
	const jobAt = new Map<string, string>();
	for (const [id, job] of Object.entries(jobsRaw.data)) {
		for (const [key, mods] of Object.entries(job.slots)) {
			if (!(KEYS as readonly string[]).includes(key))
				errors.push(`jobs.yaml: ${id}: unknown key "${key}"`);
			for (const mod of mods) {
				const at = `${key}:${mod}`;
				const other = jobAt.get(at);
				if (other)
					errors.push(
						`jobs.yaml: ${mod} ${key} is claimed by both ${other} and ${id}`,
					);
				jobAt.set(at, id);
			}
		}
	}
	const jobFor = (key: string, mod: string, cls: string): Job | null => {
		const id = jobAt.get(`${key}:${mod}`);
		if (!id) return null;
		const job = jobsRaw.data[id];
		return { id, label: job.classLabel?.[cls] ?? job.label };
	};

	const icons = iconsRaw.data;
	const missingIcons = new Set<string>();
	const iconFor = (b: Binding): string | null => {
		const icon = b.icon ?? icons[b.ability];
		if (icon && existsSync(join(ICON_DIR, `${icon}.jpg`))) return icon;
		missingIcons.add(b.ability);
		return null;
	};

	// Characters: keys, modifiers, stances, macro references.
	const bound = new Set<string>();
	const characters: ResolvedCharacter[] = charactersRaw.map((c) => {
		const where = `characters/${c.file}`;
		const stanceIds = new Set((c.stances ?? []).map((s) => s.id));
		const noMacro: string[] = [];
		const keys: ResolvedCharacter["keys"] = {};

		const resolve = (b: Binding, label: string): ResolvedBinding => {
			if (b.macro) {
				const macro = macroByName.get(b.macro);
				if (!macro)
					errors.push(
						`${where}: ${label} uses macro "${b.macro}", which isn't in macros.yaml`,
					);
				else if (macro.tab !== "general" && macro.tab !== c.class)
					errors.push(
						`${where}: ${label} uses "${b.macro}" from the ${macro.tab} tab; a ${c.class} can't see it`,
					);
				bound.add(b.macro);
			} else noMacro.push(label);
			return { ...b, icon: iconFor(b) };
		};

		for (const [key, mods] of Object.entries(c.keys)) {
			if (!(KEYS as readonly string[]).includes(key)) {
				errors.push(
					`${where}: "${key}" isn't an allowed key (${KEYS.join(" ")})`,
				);
				continue;
			}
			const k = key as Key;
			for (const [mod, slot] of Object.entries(mods)) {
				if (!(MODIFIERS as readonly string[]).includes(mod)) {
					errors.push(
						`${where}: ${key}: "${mod}" isn't a modifier (${MODIFIERS.join(" / ")})`,
					);
					continue;
				}
				const m = mod as Modifier;
				if (m === "alt" && !ALT_KEYS.includes(k))
					errors.push(
						`${where}: Alt is only allowed on ${ALT_KEYS.join(" ")}, not ${key}`,
					);
				const label =
					m === "bare" ? key : `${m[0].toUpperCase()}${m.slice(1)}+${key}`;
				const resolved: ResolvedSlot = { job: jobFor(k, m, c.class) };
				if (isStanceSlot(slot)) {
					if (stanceIds.size === 0)
						errors.push(
							`${where}: ${label} is set per stance, but ${c.name} has no stances`,
						);
					resolved.stances = {};
					for (const id of stanceIds) resolved.stances[id] = null;
					for (const [id, b] of Object.entries(slot.stances)) {
						if (!stanceIds.has(id))
							errors.push(`${where}: ${label}: unknown stance "${id}"`);
						resolved.stances[id] = resolve(b, `${label} (${id})`);
					}
				} else resolved.binding = resolve(slot, label);
				keys[k] ??= {};
				(keys[k] as Partial<Record<Modifier, ResolvedSlot>>)[m] = resolved;
			}
		}
		if (noMacro.length)
			warnings.push(
				`${c.name}: ${noMacro.length} binds have no macro: ${noMacro.join(", ")}`,
			);
		const { file: _file, ...rest } = c;
		return { ...rest, stances: c.stances ?? [], keys };
	});

	const unbound = macros.filter((m) => !bound.has(m.name));
	const isExpected = (m: Macro) =>
		EXPECTED_UNBOUND.includes(m.name.split(":")[0]);
	const surprising = unbound.filter((m) => !isExpected(m));
	const expected = unbound.filter(isExpected);
	if (surprising.length)
		warnings.push(
			`${surprising.length} macros are on no key: ${surprising.map((m) => m.name).join(", ")}`,
		);
	if (expected.length)
		warnings.push(
			`${expected.length} macros are on no key (expected for Equip/Mark/Sys): ${expected.map((m) => m.name).join(", ")}`,
		);
	if (missingIcons.size)
		warnings.push(
			`${missingIcons.size} abilities have no icon: ${[...missingIcons].sort().join(", ")}`,
		);

	const jobs = Object.entries(jobsRaw.data).map(([id, j]) => ({
		id,
		label: j.label,
	}));
	// Main first, then alts by name; file order would put the warlock ahead of the main.
	characters.sort(
		(a, b) =>
			Number(a.role === "alt") - Number(b.role === "alt") ||
			a.name.localeCompare(b.name),
	);
	return { data: { characters, macros, jobs }, issues: { errors, warnings } };
}

export function formatIssues({ errors, warnings }: Issues): string {
	const lines = [
		...errors.map((e) => `  ✗ ${e}`),
		...warnings.map((w) => `  ! ${w}`),
		`  ${errors.length} errors, ${warnings.length} warnings`,
	];
	return lines.join("\n");
}

let cached: KbData | undefined;

/** Validated data for pages. Throws if anything is invalid, which fails the build. */
export function loadData(): KbData {
	if (cached) return cached;
	const { data, issues } = validate();
	if (!data || issues.errors.length)
		throw new Error(`kb data is invalid:\n${formatIssues(issues)}`);
	cached = data;
	return data;
}
