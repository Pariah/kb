import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";
import validateData from "./src/integrations/validate";

export default defineConfig({
	site: "https://kb.xpariah.com",
	output: "static",
	integrations: [validateData(), svelte()],
});
