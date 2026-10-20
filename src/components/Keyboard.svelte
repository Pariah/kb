<script lang="ts">
	// The only hydrated island: character × modifier × stance × selected key.
	// State mirrors to the URL hash as #<character>/<modifier>/<key>[/<stance>].
	import { onMount } from "svelte";
	import type { ResolvedCharacter } from "../lib/data";
	import { canBind, combo, KEYS, MODIFIER_LABEL, MODIFIERS, type Modifier } from "../lib/keys";
	import { bindingAt, isPaged, slotAt, stanceShort } from "../lib/view";
	import MacroBox from "./MacroBox.svelte";

	interface Props {
		characters: ResolvedCharacter[];
		/** Macro name → body, for the inspector. */
		macros: Record<string, string>;
	}

	let { characters, macros }: Props = $props();

	const DEFAULT_KEY = "F";
	const firstStance = (c: ResolvedCharacter) => c.stances[0]?.id ?? "";

	let slug = $state("");
	let mod = $state<Modifier>("bare");
	let stance = $state("");
	let key = $state(DEFAULT_KEY);

	const char = $derived(characters.find((c) => c.slug === slug) ?? characters[0]);
	const activeStance = $derived(stance || firstStance(char));

	// ── Board geometry ──────────────────────────────────────────────────────
	// Desktop: a staggered left half. Phone: 6-column ortholinear grid, where
	// --pr / --pc place each cap (` drops under Z to start a consumables column).

	type Cell =
		| { kind: "key"; key: string; pr: number; pc: number }
		| { kind: "move"; key: string; name: string; pr: number; pc: number }
		| { kind: "wide"; label: string; w: number }
		| { kind: "mod"; mod: Modifier; w: number };

	const MOVE: Record<string, string> = { W: "Forward", A: "Strafe L", S: "Back", D: "Strafe R" };
	const at = (keys: string[], pr: number): Cell[] =>
		keys.map((k, i) =>
			k in MOVE
				? { kind: "move", key: k, name: MOVE[k], pr, pc: i + 1 }
				: { kind: "key", key: k, pr, pc: i + 1 },
		);

	const ROWS: Cell[][] = [
		[{ kind: "key", key: "`", pr: 5, pc: 1 }, ...at(["1", "2", "3", "4", "5", "6"], 1)],
		[{ kind: "wide", label: "Tab", w: 1.5 }, ...at(["Q", "W", "E", "R", "T", "Y"], 2)],
		[{ kind: "wide", label: "Caps", w: 1.75 }, ...at(["A", "S", "D", "F", "G", "H"], 3)],
		[{ kind: "mod", mod: "shift", w: 2.25 }, ...at(["Z", "X", "C", "V", "B"], 4)],
		[
			{ kind: "mod", mod: "ctrl", w: 1.25 },
			{ kind: "mod", mod: "alt", w: 1.25 },
		],
	];

	// ── What each cap shows ─────────────────────────────────────────────────

	function capView(k: string) {
		if (!canBind(k, mod)) return { binding: null, job: null, name: "—" };
		const binding = bindingAt(char, k, mod, activeStance);
		const job = binding ? (slotAt(char, k, mod)?.job ?? null) : null;
		return { binding, job, name: binding?.ability ?? "Open" };
	}

	const selected = $derived(capView(key));

	/** Every binding on the selected key. Number-row keys list bare once per stance. */
	const stack = $derived.by(() => {
		const paged = isPaged(char, key);
		const rows: { label: string; name?: string; current: boolean }[] = [];
		if (paged)
			for (const s of char.stances)
				rows.push({
					label: stanceShort(s.label),
					name: bindingAt(char, key, "bare", s.id)?.ability,
					current: mod === "bare" && activeStance === s.id,
				});
		for (const m of MODIFIERS) {
			if (!canBind(key, m) || (paged && m === "bare")) continue;
			rows.push({
				label: MODIFIER_LABEL[m],
				name: bindingAt(char, key, m, activeStance)?.ability,
				current: mod === m,
			});
		}
		return rows;
	});

	const macroName = $derived(selected.binding?.macro);

	// ── State ↔ URL hash ────────────────────────────────────────────────────

	function readHash() {
		const [c, m, k, s] = location.hash.slice(1).split("/").map(decodeURIComponent);
		const found = characters.find((x) => x.slug === c);
		if (!found) return;
		slug = found.slug;
		mod = (MODIFIERS as readonly string[]).includes(m) ? (m as Modifier) : "bare";
		key = (KEYS as readonly string[]).includes(k) ? k : DEFAULT_KEY;
		stance = found.stances.some((x) => x.id === s) ? s : firstStance(found);
	}

	function writeHash() {
		const parts = [char.slug, mod, key];
		if (char.stances.length && activeStance !== firstStance(char)) parts.push(activeStance);
		history.replaceState(null, "", `#${parts.map(encodeURIComponent).join("/")}`);
	}

	onMount(() => {
		readHash();
		window.addEventListener("hashchange", readHash);
		return () => window.removeEventListener("hashchange", readHash);
	});

	// The static bindings tables below the board follow the picked character.
	$effect(() => {
		for (const el of document.querySelectorAll<HTMLElement>("[data-bindings]"))
			el.hidden = el.dataset.bindings !== char.slug;
	});

	function pickCharacter(c: ResolvedCharacter) {
		slug = c.slug;
		stance = firstStance(c);
		writeHash();
	}
	function pickMod(m: Modifier) {
		mod = m;
		writeHash();
	}
	/** The ghost modifier caps toggle: pressing a lit one goes back to bare. */
	function toggleMod(m: Modifier) {
		pickMod(mod === m ? "bare" : m);
	}
	function pickStance(id: string) {
		stance = id;
		writeHash();
	}
	function pickKey(k: string) {
		key = k;
		writeHash();
	}
</script>

<header>
	<span class="mark">kb</span>
	<nav class="chars" aria-label="Character">
		{#each characters as c (c.slug)}
			<button
				class="char"
				aria-pressed={c.slug === char.slug}
				style:--class="var(--class-{c.class})"
				onclick={() => pickCharacter(c)}
			>
				<b>{c.class}</b>
				{#if c.race}<span class="micro">{c.race}</span>{/if}
			</button>
		{/each}
	</nav>
</header>

<div class="controls">
	<div class="ctl">
		<span class="label">Modifier</span>
		<div class="seg" role="group" aria-label="Modifier">
			{#each MODIFIERS as m (m)}
				<button aria-pressed={mod === m} onclick={() => pickMod(m)}>{MODIFIER_LABEL[m]}</button>
			{/each}
		</div>
	</div>
	{#if char.stances.length}
		<div class="ctl">
			<span class="label">Stance</span>
			<div class="seg" role="group" aria-label="Stance">
				{#each char.stances as s (s.id)}
					<button aria-pressed={activeStance === s.id} aria-label={s.label} onclick={() => pickStance(s.id)}
						>{stanceShort(s.label)}</button
					>
				{/each}
			</div>
		</div>
	{/if}
</div>

<div class="surface">
	<div class="board">
		{#each ROWS as row, i (i)}
			<div class="row">
				{#each row as cell, j (j)}
					{#if cell.kind === "key"}
						{@const v = capView(cell.key)}
						<button
							class="key"
							class:empty={!v.binding}
							style:--pr={cell.pr}
							style:--pc={cell.pc}
							style:--job={v.job ? `var(--job-${v.job.id})` : null}
							aria-pressed={key === cell.key}
							aria-label="{cell.key}: {v.name}"
							onclick={() => pickKey(cell.key)}
						>
							<span class="lg">{cell.key}</span>
							<span class="ic">
								{#if v.binding?.icon}
									<img src="/icons/{v.binding.icon}.jpg" alt="" width="36" height="36" />
								{/if}
							</span>
							<span class="nm">{v.name}</span>
						</button>
					{:else if cell.kind === "move"}
						<div class="key ghost blocked" style:--pr={cell.pr} style:--pc={cell.pc} aria-hidden="true">
							<span class="lg">{cell.key}</span>
							<span class="ic"></span>
							<span class="nm">{cell.name}</span>
						</div>
					{:else if cell.kind === "wide"}
						<div class="key ghost wide blocked" style:--w={cell.w} aria-hidden="true">
							<span class="lg">{cell.label}</span>
						</div>
					{:else}
						<button
							class="key ghost wide mod"
							style:--w={cell.w}
							aria-pressed={mod === cell.mod}
							aria-label="{MODIFIER_LABEL[cell.mod]} layer"
							onclick={() => toggleMod(cell.mod)}
						>
							<span class="lg">{MODIFIER_LABEL[cell.mod]}</span>
						</button>
					{/if}
				{/each}
			</div>
		{/each}
	</div>

	<aside class="insp" aria-live="polite">
		<div class="head">
			{#if selected.binding?.icon}
				<img src="/icons/{selected.binding.icon}.jpg" alt="" width="56" height="56" />
			{/if}
			<div class="titles">
				<span class="combo">{combo(mod, key, " + ")}</span>
				<h2 class="ability">{selected.name}</h2>
			</div>
		</div>
		{#if selected.job}
			<span class="chip micro" style:--c="var(--job-{selected.job.id})">{selected.job.label}</span>
		{/if}
		<div class="stack">
			{#each stack as row (row.label)}
				<div class="layer" class:current={row.current}>
					<span class="micro">{row.label}</span>
					<span class:open={!row.name}>{row.name ?? "Open"}</span>
				</div>
			{/each}
		</div>
		{#if macroName && macros[macroName]}
			{#key macroName}
				<MacroBox name={macroName} body={macros[macroName]} />
			{/key}
		{/if}
	</aside>
</div>

<style>
	/* Header: TE nav grammar, lowercase names with mono sublines. */
	header {
		display: flex;
		flex-wrap: wrap;
		gap: 32px;
		align-items: flex-start;
		padding-block: 24px 40px;
		border-bottom: 1px solid var(--n-2);
		margin-bottom: 32px;
	}
	.mark {
		font: 200 var(--t-h2) / 1 var(--f-display);
		font-stretch: 125%;
		color: var(--n-8);
		letter-spacing: -0.01em;
	}
	.chars {
		display: flex;
		flex-wrap: wrap;
		gap: 28px;
	}
	.char {
		display: grid;
		gap: 4px;
		padding: 0;
		background: none;
		border: 0;
		text-align: left;
		color: var(--n-5);
		cursor: pointer;
	}
	.char b {
		position: relative;
		font: 300 var(--t-h3) / 1 var(--f-display);
		font-stretch: 112.5%;
	}
	.char:hover {
		color: var(--n-6);
	}
	.char[aria-pressed="true"] {
		color: var(--n-8);
	}
	/* Out of flow, so moving the dot never shifts a name. */
	.char[aria-pressed="true"] b::after {
		content: "";
		position: absolute;
		top: 50%;
		left: calc(100% + 8px);
		width: 6px;
		height: 6px;
		translate: 0 -50%;
		background: var(--class, var(--n-8));
		border-radius: 50%;
	}

	/* Segmented controls: the active segment inverts. */
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 24px 40px;
		margin-bottom: 20px;
	}
	.ctl {
		display: grid;
		gap: 6px;
	}
	.seg {
		display: flex;
		border: 1px solid var(--n-3);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.seg button {
		padding: 8px 14px;
		background: var(--n-1);
		color: var(--n-6);
		border: 0;
		border-right: 1px solid var(--n-3);
		font: 500 var(--t-label) / 1 var(--f-mono);
		font-stretch: 75%;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.seg button:last-child {
		border-right: 0;
	}
	.seg button:hover {
		color: var(--n-8);
	}
	.seg button[aria-pressed="true"] {
		background: var(--n-8);
		color: var(--n-0);
	}

	/* Board + inspector. */
	.surface {
		display: grid;
		grid-template-columns: max-content minmax(300px, 1fr);
		gap: 40px;
		align-items: start;
	}
	.board {
		display: grid;
		gap: var(--gap);
		width: max-content;
		padding: 20px;
		background: var(--n-1);
		border: 1px solid var(--n-2);
		border-radius: var(--radius-board);
	}
	.row {
		display: flex;
		gap: var(--gap);
	}

	.key {
		position: relative;
		flex: none;
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: 3px;
		width: var(--cap);
		height: var(--cap);
		padding: 7px 8px 8px 10px;
		background: var(--n-2);
		border: 1px solid var(--n-3);
		border-radius: var(--radius);
		color: var(--n-7);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.key:hover {
		border-color: var(--n-5);
	}
	.lg {
		justify-self: start;
		font: 500 var(--t-label) / 1 var(--f-mono);
		text-transform: uppercase;
		color: var(--n-6);
	}
	.ic {
		align-self: center;
		justify-self: center;
		width: 36px;
		height: 36px;
	}
	.ic img {
		display: block;
		width: 100%;
		height: 100%;
	}
	.nm {
		display: flex;
		align-items: flex-end;
		min-height: 2.3em;
		font: 600 11px / 1.15 var(--f-display);
		font-stretch: 75%;
		letter-spacing: 0.01em;
		text-transform: uppercase;
		color: var(--n-7);
		/* Break at spaces only. */
		overflow-wrap: normal;
		word-break: keep-all;
		hyphens: none;
	}
	/* Job mark: an L bracket wrapping the name, never a rail. */
	.key::after {
		content: "";
		position: absolute;
		left: -1px;
		bottom: -1px;
		width: 46%;
		height: 46%;
		border-left: 2px solid var(--job, transparent);
		border-bottom: 2px solid var(--job, transparent);
		border-bottom-left-radius: var(--radius);
		pointer-events: none;
	}
	.key[aria-pressed="true"]:not(.mod) {
		background: var(--n-3);
		border-color: var(--n-8);
	}
	.key[aria-pressed="true"]:not(.mod) .lg {
		margin: -2px -3px;
		padding: 2px 3px;
		background: var(--n-8);
		color: var(--n-0);
	}
	.key.empty {
		background: transparent;
		border-style: dashed;
	}
	.key.empty .nm {
		color: var(--n-4);
	}
	.key.ghost {
		background: transparent;
		border-color: var(--n-2);
		color: var(--n-4);
		cursor: default;
	}
	.key.ghost .lg,
	.key.ghost .nm {
		color: var(--n-4);
	}
	.key.ghost .nm {
		font-weight: 400;
	}
	/* Keys the layout never binds (Tab, Caps, movement): faint hatching. */
	.key.blocked {
		background: repeating-linear-gradient(-45deg, transparent 0 7px, var(--n-2) 7px 8px);
	}
	.wide {
		width: calc(var(--w) * var(--u) - var(--gap));
	}
	.key.mod {
		cursor: pointer;
	}
	.key.mod:hover {
		border-color: var(--n-5);
	}
	.key.mod[aria-pressed="true"] {
		border-color: var(--n-8);
	}
	.key.mod[aria-pressed="true"] .lg {
		color: var(--n-8);
	}

	/* Inspector. */
	.insp {
		display: grid;
		gap: 20px;
		min-width: 0;
		padding-top: 16px;
		border-top: 1px solid var(--n-3);
	}
	.head {
		display: flex;
		gap: 16px;
		align-items: flex-start;
	}
	.head img {
		flex: none;
		border: 1px solid var(--n-3);
		border-radius: var(--radius);
	}
	.titles {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.combo {
		font: 500 var(--t-h3) / 1 var(--f-mono);
		font-stretch: 75%;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--n-8);
	}
	.ability {
		margin: 0;
		font: 200 var(--t-h1) / 1.05 var(--f-display);
		font-stretch: 118%;
		letter-spacing: -0.015em;
		color: var(--n-8);
		text-wrap: balance;
	}
	/* Job chip: the same L as the key's job mark, at 9px. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--n-6);
	}
	.chip::before {
		content: "";
		width: 9px;
		height: 9px;
		border-left: 2px solid var(--c);
		border-bottom: 2px solid var(--c);
	}
	.stack {
		display: grid;
		border: 1px solid var(--n-2);
	}
	.layer {
		display: grid;
		grid-template-columns: 56px 1fr;
		gap: 12px;
		align-items: center;
		padding: 8px 10px;
		border-bottom: 1px solid var(--n-2);
	}
	.layer:last-child {
		border-bottom: 0;
	}
	.layer.current {
		background: var(--n-2);
	}
	.layer .micro {
		color: var(--n-5);
	}
	.layer .open {
		color: var(--n-4);
	}

	@media (prefers-reduced-motion: no-preference) {
		.key {
			transition:
				border-color 0.12s,
				background-color 0.12s;
		}
	}

	/* Inspector drops under the board when both don't fit side by side. */
	@media (max-width: 1180px) {
		.surface {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	/* Between phone and full desktop the staggered board (7.75u wide) shrinks to
	   fit. Caps get too short for names, so, as on phone, names live in the inspector. */
	@media (min-width: 721px) and (max-width: 860px) {
		.board {
			--u: min(96px, calc((100vw - 90px) / 7.75));
			--cap: calc(var(--u) - var(--gap));
		}
		.nm {
			display: none;
		}
		.key {
			grid-template-rows: auto 1fr;
		}
	}

	/* Phone: ortholinear 6 columns, R F V stack so a column job reads as one run. */
	@media (max-width: 720px) {
		header {
			gap: 16px;
			padding-block: 16px 20px;
			margin-bottom: 20px;
		}
		.surface {
			gap: 24px;
		}
		.board {
			grid-template-columns: repeat(6, minmax(0, 1fr));
			width: 100%;
			padding: 12px;
		}
		.row {
			display: contents;
		}
		.wide {
			display: none;
		}
		.key {
			grid-row: var(--pr);
			grid-column: var(--pc);
			grid-template-rows: auto 1fr;
			width: auto;
			min-width: 0;
			height: auto;
			aspect-ratio: 1;
			padding: 5px 5px 5px 7px;
		}
		.nm {
			display: none;
		}
		.ic {
			width: 28px;
			height: 28px;
		}
		.controls {
			position: fixed;
			z-index: 5;
			inset: auto 0 0;
			justify-content: space-between;
			gap: 10px;
			margin: 0;
			padding: 10px max(16px, env(safe-area-inset-right, 0px)) calc(10px + env(safe-area-inset-bottom, 0px))
				max(16px, env(safe-area-inset-left, 0px));
			background: var(--n-1);
			border-top: 1px solid var(--n-3);
		}
		.controls .label {
			display: none;
		}
		.seg button {
			padding: 11px 8px;
		}
	}
</style>
