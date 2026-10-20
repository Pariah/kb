// `bun run validate`: same checks the build runs, without building.
import { formatIssues, validate } from "../src/lib/data";

const { issues } = validate();
console.log(`kb data\n${formatIssues(issues)}`);
process.exit(issues.errors.length ? 1 : 0);
