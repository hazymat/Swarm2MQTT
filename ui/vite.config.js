import {defineConfig} from "vite";
import {svelte} from "@sveltejs/vite-plugin-svelte";
export default defineConfig({plugins: [svelte({onwarn: (warning, handler) => {if (!warning.code.startsWith("a11y")) handler(warning)}})], build: {outDir: "../dist/ui", emptyOutDir: true}, server: {proxy: {"/ws": {target: "ws://localhost:8080", ws: true}, "/picture": "http://localhost:8080"}}});
