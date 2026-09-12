import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// "Stream Violet" identity fonts (.scratch/twitchtrack-v1-spec/issues/09-visual-identity-prototype.md),
// self-hosted via @fontsource so the app never depends on network access to render correctly.
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
