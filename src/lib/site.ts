// Where the open source project lives, and the commands that install it. One place, so the landing page
// never disagrees with the README.

/** Built for a static host (GitHub Pages): no console behind it, so nothing links to /app. */
export const STATIC_SITE = import.meta.env.VITE_STATIC_SITE === "1";

export const REPO_URL = "https://github.com/DevBash1/opsmira";
export const DOCS_URL = `${REPO_URL}/blob/main/docs/self-hosting.md`;
export const SECURITY_URL = `${REPO_URL}/blob/main/SECURITY.md`;
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

/** The published landing page, which also serves install.sh and docker-compose.yml. */
export const SITE_URL = "https://devbash1.github.io/opsmira";

export const INSTALL_COMMANDS = [
  { id: "script", label: "Script", command: `curl -fsSL ${SITE_URL}/install.sh | sh` },
  {
    id: "docker",
    label: "Docker",
    command: "docker run -d --name opsmira -p 127.0.0.1:8787:8787 -v opsmira-data:/data -e OPENROUTER_API_KEY=sk-or-... ghcr.io/devbash1/opsmira:latest",
  },
  {
    id: "compose",
    label: "Compose",
    command: `curl -fsSLO ${SITE_URL}/docker-compose.yml && echo "OPENROUTER_API_KEY=sk-or-..." > .env && docker compose up -d`,
  },
] as const;
