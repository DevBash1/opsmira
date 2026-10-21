import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// iOS Safari only applies :active (our press-scale feedback) once a touch listener exists.
document.addEventListener("touchstart", () => {}, { passive: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
