// Deploy config for `cf`. The Astro adapter builds a static-assets Worker (no
// script, no bindings beyond ASSETS); this adds its name and custom domain.
import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "kb",
		compatibilityDate: "2026-10-07",
		domains: ["kb.xpariah.com"],
	},
});
