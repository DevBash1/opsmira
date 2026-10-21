// Import first in every test: settings the server needs at import time, pointed at a throwaway data directory.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.OPENROUTER_API_KEY ||= "test-key";
process.env.OPSMIRA_ENV_FILE = join(tmpdir(), "opsmira-test-no-such-env");
process.env.OPSMIRA_DATA_DIR = mkdtempSync(join(tmpdir(), "opsmira-test-"));
