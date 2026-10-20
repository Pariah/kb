import cloudflare from "@astrojs/cloudflare";
import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";
import validateData from "./src/integrations/validate";

export default defineConfig({
	site: "https://kb.xpariah.com",
	output: "static",
	integrations: [validateData(), svelte()],
	// Free tier, no extra products: no KV sessions, no Cloudflare Images.
	// Prerender in Node so the data loader can read src/data from disk.
	session: false,
	adapter: cloudflare({
		imageService: "passthrough",
		prerenderEnvironment: "node",
	}),
});
