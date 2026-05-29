import "./app.css";
import App from "./App.svelte";
import { mount } from "svelte";
import { importFromUrl } from "./lib/connection.svelte";

importFromUrl();

const app = mount(App, { target: document.getElementById("app")! });

export default app;
