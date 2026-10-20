/** @type {import("prettier").Config} */
export default {
	plugins: ["prettier-plugin-astro", "prettier-plugin-svelte"],
	overrides: [
		{
			files: "*.astro",
			options: {
				parser: "astro",
			},
		},
	],
	// Match Biome's settings
	useTabs: true,
	tabWidth: 2,
	printWidth: 120,
};
