<script lang="ts">
	// One markup for the inspector (hydrated) and the library (static HTML).
	// Styles live in src/styles/macro.css; copying is src/scripts/copy.ts.
	interface Props {
		name: string;
		body: string;
	}

	let { name, body }: Props = $props();
</script>

<div class="macro">
	<div class="macro-head">
		<span class="macro-name">{name}</span>
		<span class="macro-count" aria-live="polite"
			><span class="n">{body.length}/255</span><span class="ok">Copied</span><span class="no"
				>Copy blocked · select the text</span
			></span
		>
	</div>
	<pre class="macro-body" role="button" tabindex="0" aria-label="Copy macro {name}">{body}</pre>
</div>
