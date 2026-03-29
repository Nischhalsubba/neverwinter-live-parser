/**
 * Renderer entry point.
 * Mounts the React application inside the Electron window and attaches the
 * shared desktop styles used by the shell.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "../styles/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
