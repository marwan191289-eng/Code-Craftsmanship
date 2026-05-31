import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

function hideSplash() {
  const splash = document.getElementById("splash");
  if (splash) {
    splash.classList.add("hidden");
    setTimeout(() => splash.remove(), 600);
  }
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

if (document.readyState === "complete") {
  hideSplash();
} else {
  window.addEventListener("load", hideSplash, { once: true });
  setTimeout(hideSplash, 3000);
}
