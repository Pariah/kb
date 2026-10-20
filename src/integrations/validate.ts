import type { AstroIntegration } from "astro";
import { validate } from "../lib/data";

/** Runs the data checks at startup of `astro dev` and `astro build`. Errors stop it. */
export default function validateData(): AstroIntegration {
	return {
		name: "kb:validate",
		hooks: {
			"astro:config:setup": ({ logger }) => {
				const { issues } = validate();
				for (const w of issues.warnings) logger.warn(w);
				if (issues.errors.length) {
					for (const e of issues.errors) logger.error(e);
					throw new Error(`kb data has ${issues.errors.length} errors`);
				}
				logger.info(`data ok, ${issues.warnings.length} warnings`);
			},
		},
	};
}
