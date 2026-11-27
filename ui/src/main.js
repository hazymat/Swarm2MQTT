import "./style.css";
import {mount} from "svelte";
import App from "./App.svelte";
import {connect} from "./api.svelte.js";
connect();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
mount(App, {target: document.getElementById("app")});
