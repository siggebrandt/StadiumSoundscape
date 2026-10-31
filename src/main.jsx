import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "./index.css";
import App from "./App.jsx";
import GameStatsSlider from "./components/gameStatsSlider";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <GameStatsSlider />
      <App />
    </BrowserRouter>
  </StrictMode>,
);
