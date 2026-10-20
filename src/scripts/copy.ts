// Click, Enter or Space on a macro box copies its body. Delegated from the
// document so it also covers boxes the keyboard island renders later.
const SHOW_MS = { ok: 1400, no: 4000 };
const timers = new WeakMap<HTMLElement, number>();

async function copy(body: HTMLElement) {
	const macro = body.closest<HTMLElement>(".macro");
	if (!macro) return;
	let state: keyof typeof SHOW_MS = "ok";
	try {
		await navigator.clipboard.writeText(body.textContent ?? "");
	} catch {
		state = "no";
	}
	macro.dataset.copied = state;
	clearTimeout(timers.get(macro));
	timers.set(
		macro,
		window.setTimeout(() => delete macro.dataset.copied, SHOW_MS[state]),
	);
}

const target = (e: Event) =>
	e.target instanceof Element
		? e.target.closest<HTMLElement>(".macro-body")
		: null;

document.addEventListener("click", (e) => {
	const body = target(e);
	// A drag-select to copy by hand shouldn't also fire the copy.
	if (body && !window.getSelection()?.toString()) copy(body);
});

document.addEventListener("keydown", (e) => {
	const body = target(e);
	if (body && (e.key === "Enter" || e.key === " ")) {
		e.preventDefault();
		copy(body);
	}
});
