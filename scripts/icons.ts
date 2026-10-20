// `bun run icons`: fills src/data/icons.yaml and downloads icons into public/icons.
// Dev-time only. The site serves the committed files and never calls Wowhead.
//
// 1. Every ability bound in src/data/characters that has no icon (no binding `icon`,
//    no icons.yaml entry) is looked up on Wowhead: Classic first, then Retail for
//    spells Classic doesn't have (Victory Rush, Commanding Shout). Only an exact
//    name match counts. Spells win over items.
// 2. Every icon name in use is downloaded once from Wowhead's icon CDN.
// 3. Anything unresolved or failed is listed; pick a stand-in for it in icons.yaml.
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, parseDocument } from "yaml";

const ROOT = join(import.meta.dir, "..");
const ICONS_YAML = join(ROOT, "src/data/icons.yaml");
const ICON_DIR = join(ROOT, "public/icons");
const CDN = "https://wow.zamimg.com/images/wow/icons/large";
const SEARCH = {
	classic: "https://www.wowhead.com/classic/search/suggestions-template?q=",
	retail: "https://www.wowhead.com/search/suggestions-template?q=",
};
const HEADERS = {
	"User-Agent": "kb.xpariah.com icon fetch (one-off, dev time)",
};
const TYPE = { item: 3, spell: 6 };

interface Suggestion {
	type: number;
	name: string;
	icon?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Walks a character file and yields every { ability, icon? } binding. */
function* bindings(
	node: unknown,
): Generator<{ ability: string; icon?: string }> {
	if (!node || typeof node !== "object") return;
	if ("ability" in node && typeof node.ability === "string") {
		yield node as { ability: string; icon?: string };
		return;
	}
	for (const value of Object.values(node)) yield* bindings(value);
}

async function lookup(
	ability: string,
): Promise<{ icon: string; source: string } | null> {
	for (const [source, url] of Object.entries(SEARCH)) {
		const res = await fetch(url + encodeURIComponent(ability), {
			headers: HEADERS,
		});
		await sleep(300);
		if (!res.ok) continue;
		const { results = [] } = (await res.json()) as { results?: Suggestion[] };
		const exact = results.filter(
			(r) => r.icon && r.name.toLowerCase() === ability.toLowerCase(),
		);
		const hit =
			exact.find((r) => r.type === TYPE.spell) ??
			exact.find((r) => r.type === TYPE.item);
		if (hit?.icon) return { icon: hit.icon, source };
	}
	return null;
}

async function download(icon: string): Promise<boolean> {
	const res = await fetch(`${CDN}/${icon}.jpg`, { headers: HEADERS });
	await sleep(150);
	if (!res.ok || res.headers.get("content-type") !== "image/jpeg") return false;
	await Bun.write(join(ICON_DIR, `${icon}.jpg`), await res.arrayBuffer());
	return true;
}

const doc = parseDocument(readFileSync(ICONS_YAML, "utf8"));
const map = (doc.toJS() ?? {}) as Record<string, string>;

const charDir = join(ROOT, "src/data/characters");
const all = readdirSync(charDir)
	.filter((f) => f.endsWith(".yaml"))
	.flatMap((f) => [
		...bindings(parse(readFileSync(join(charDir, f), "utf8")).keys),
	]);

const needed = new Set<string>();
const unresolved: string[] = [];
const added: string[] = [];
for (const ability of new Set(
	all.filter((b) => !b.icon).map((b) => b.ability),
)) {
	if (map[ability]) continue;
	const hit = await lookup(ability);
	if (hit) {
		map[ability] = hit.icon;
		doc.set(ability, hit.icon);
		added.push(
			`${ability} → ${hit.icon}${hit.source === "retail" ? " (retail)" : ""}`,
		);
	} else unresolved.push(ability);
}
for (const b of all) {
	const icon = b.icon ?? map[b.ability];
	if (icon) needed.add(icon);
}

if (added.length) await Bun.write(ICONS_YAML, doc.toString({ lineWidth: 0 }));

mkdirSync(ICON_DIR, { recursive: true });
const fetched: string[] = [];
const failed: string[] = [];
for (const icon of [...needed].sort()) {
	if (existsSync(join(ICON_DIR, `${icon}.jpg`))) continue;
	if (await download(icon)) fetched.push(icon);
	else failed.push(icon);
}

console.log(`looked up ${added.length}:`);
for (const a of added) console.log(`  + ${a}`);
console.log(
	`downloaded ${fetched.length} icons, ${needed.size - fetched.length - failed.length} already present`,
);
if (failed.length)
	console.log(
		`not on the CDN (fix the name in icons.yaml): ${failed.join(", ")}`,
	);
if (unresolved.length)
	console.log(
		`no exact match (pick a stand-in in icons.yaml): ${unresolved.join(", ")}`,
	);
