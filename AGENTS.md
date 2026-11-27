# Notes for agents

- SPEC.md is the source of truth. Mockups before any UI work.
- UI follows the shared rules for every app: https://github.com/hazymat/sift/blob/main/docs/ui-consistency.md#rules-for-every-app. A change here that adds or alters a shared pattern updates that section in the same piece of work.
- No AI attribution anywhere: commits, PRs, comments or code.
- Layout: `src/` service (Node 22.13+, TypeScript, node:sqlite), `src/radio/` (herdsman.ts real stick, sim.ts simulator), `ui/` Svelte 5 page built into `dist/ui`. `npm run build`, `npm test`, `npm run sim` (port 8080, data in ./data-sim).
- The service must never exit because of the stick: radio errors go through the supervisor in app.ts and are retried.
- Code style: compact, descriptive names (no single letters), no spread operator.
- Releases: every push to main is a dev pre-release `v0.1.<run>`; promote with the Build workflow's `stable_version` input.
