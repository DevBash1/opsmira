/// <reference types="vite/client" />

interface Window {
  /** Set by the Opsmira server when it serves only the console, at "/". */
  __OPSMIRA_CONSOLE_AT_ROOT__?: boolean;
}
