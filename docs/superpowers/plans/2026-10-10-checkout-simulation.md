# Checkout Simulation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.
>
> Execution note: those additional skills are not installed here. Use the available native subagents with explicit file ownership and integration review. This directory is not a Git repository, so do not create a worktree or commits as a prerequisite. The user has authorized starting implementation; no additional execution approval is required.

**Goal:** Build a local, interactive, genuinely 3D checkout comparison from SPECIFIKACIJA_ROBLOX_SIMULACIJA.md, with repeatable customer traffic, truthful metrics and a polished browser presentation.

**Architecture:** A deterministic simulation owns time, customer records and checkout resources independently of Babylon rendering. Babylon consumes read-only snapshots; DOM controls configure and advance the simulation. Blender creates a reusable checkout asset, with procedural Babylon geometry for the rest of the scene.

**Tech Stack:** TypeScript, Vite, Babylon.js, Vitest, Blender Python, browser UI verification.

---

## Chunk 1: Specification and interfaces

### Task 1: Record interpretation and define boundaries
**Files:** `docs/SPECIFIKACIJA_WEB.md`, `src/simulation/types.ts`, `src/simulation/config.ts`.
- [x] Preserve the Roblox specification as original input; document web-specific decisions separately.
- [x] Define shared configuration, customer, lane, metric and snapshot types before parallel implementation.
- [x] Keep one generated arrival sequence shared by both zones. Store per-customer random lane-choice values so processing order cannot change randomness.
- [x] Use simulation time with a fixed deterministic step or an event queue; do not use wall-clock timers inside the model. UI acceleration only controls how much simulated time advances.
- [x] Reserve a tunnel station when the first article reaches the diverter. Retain it until bagging finishes. Payment stops conveyor transport, while the following customer may load available belt space.
- [x] Classic scanning and the previous customer's bagging overlap; the next payment waits for the single bagging area.
- [x] End arrivals at RunDuration and offer draining the remaining customers. Report horizon throughput separately from final completion; distinguish incomplete customers from completed-only duration averages.
- [x] Document the deliberate abstraction: no collisions or barcode failures, simplified article geometry and customer animation; model resource capacity and timings explicitly.

### Task 2: Review plan
**Files:** this plan and original specification.
- [x] Have a reviewer check coverage, fairness, interfaces and validation plan.
- [x] Incorporate actionable review before final integration.

Review incorporated: belt length 12, spacing 0.8, tunnel scan at 60%, divider arrival at endpoint; loading/scanning overlap; existing station owner continues routing; cosmetic walking. Explicit UI metrics, frozen horizon, state colors, visible dividers/cashiers and CSV/time-acceleration checks included in implementation acceptance.

## Chunk 2: Independently testable simulation

### Task 3: Implement customer sequence and checkout engine (simulation subagent)
**Files:** `src/simulation/engine.ts`, `src/simulation/engine.test.ts`, optional simulation-only helpers.
- [x] Write tests for repeatability, identical arrivals, resource ownership, payment hold, capacity blocking, classic overlap, drain and conservation of customers.
- [x] Run `npm test -- --run`; confirm missing implementation fails before implementing.
- [x] Implement seeded arrivals and identical record copies into both zones.
- [x] Implement loading, conveyor/scanning, payment and bagging with safe resource release.
- [x] Implement queue choice, tunnel wake threshold and idle delay.
- [x] Derive samples every 10 seconds and aggregate metrics from actual simulated timestamps.
- [x] Test identical results for one large advance and many small advances.
- [x] Run the tests and document any model simplifications.

## Chunk 3: 3D presentation and interface

### Task 4: Build the scene and Blender asset (visual subagent)
**Files:** `src/scene/createScene.ts`, `scripts/create_checkout_assets.py`, `public/models/checkout-tunnel.glb`, `docs/BLENDER.md`.
- [x] Use Blender Python to generate a bevelled metal scanner tunnel with glass and status details, save source .blend and export .glb reproducibly.
- [x] Load asset in Babylon; use graceful procedural fallback if asset loading fails.
- [x] Build two labelled zones, 1–4 lanes, tunnel packaging stations and cashier desks.
- [x] Draw customers with recognisable bodies, baskets and animated limbs; articles travel along belts and route toward the assigned station.
- [x] Add shadows, materials and a readable default orbit camera. Offer overview and zone focus.
- [x] Expose `createCheckoutScene(canvas, config)` returning `update(snapshot)`, `focus(zone|'all')`, `resize()`, `dispose()` and optional picking callback.
- [x] React to simulation snapshots only. Do not independently decide throughput or customer state.

### Task 5: Build controls and analytics (main agent)
**Files:** `index.html`, `package.json`, `tsconfig.json`, `src/main.ts`, `src/styles.css`, `src/ui.ts` if needed.
- [x] Install Babylon, Vite, TypeScript and Vitest with a committed lockfile.
- [x] Build a Croatian interface: polished dark analytics panel around a light, spacious 3D floor; readable type, clear cyan/orange zone identities.
- [x] Add start/pause/reset, speed 1–20×, camera controls, traffic presets, seed, lane count and station count.
- [x] Add visible elapsed time, live arrivals/exits/queue/waiting metrics, throughput history and explanatory legends.
- [x] Apply configuration changes on explicit restart; label this behavior.
- [x] Export time-series and per-customer data with metadata to CSV.
- [x] Provide horizon summary, drain action and completed-only average caveat.

## Chunk 4: Integration and acceptance

### Task 6: Validate and deliver
**Files:** `README.md`, this plan, fixes to the relevant source files.
- [x] Run `npm test -- --run`: all simulation invariants pass.
- [x] Run `npm run build`: typecheck and production build succeed.
- [x] Serve with `npm run dev -- --host 127.0.0.1` and open the local URL in Codex.
- [x] Inspect rendered scene in an actual browser; verify real 3D perspective, loaded assets, both zones and visible customers.
- [x] Exercise pause/resume, reset, speed, presets, camera controls, run completion and export control (download-path limitation below).
- [x] Check browser console for runtime errors and confirm resize behavior.
- [x] Record model assumptions, commands, tested scope and remaining improvements in README.
- [x] Update checkboxes based on observed results; hand off the running local preview and files.

Acceptance: a usable local simulation with both systems, believable 3D presentation and repeatable measured results. No claim of real-store performance validation: input timings remain estimates from the original spec.

## Execution record — 2026-10-10

Completed in this chat with subagents for simulation, Blender/Babylon and independent plan/code review. The root agent implemented controls/analytics and integrated the app.

- Pure engine: 26 passing tests, including the 12 preset/lane/station combinations, deterministic chunking, known single-customer timelines, transport pauses and horizon/drain behavior.
- CSV: 3 passing serialization tests inspect generated Blob content, config metadata, shared records and completed/unfinished fields. Browser export control was exercised and its preparation confirmation appeared; the in-app browser did not provide a completed download path, so native saving is not independently verified.
- Production build and TypeScript passed. Dependency audit: 0 vulnerabilities. Vite reports a large Babylon bundle; code splitting is a later optimization.
- Actual browser: 3D rendering and original GLB visible; camera overview/focus, speed, pause/resume, reset, changed configuration, horizon and drain exercised. Five-minute normal scenario/seed12345: 22 arrivals, horizon exits A18/B15, draining finished A22/B22 at approximately 6:49. This is a test fixture result, not a real-world performance claim.
- One-lane/one-station rush scenario visibly queued customers; tunnel blocked share reached 43.2%. Model payment/block position freezing verified by unit tests. Browser inspection did not separately capture each transition.
- Narrow viewport: no horizontal document overflow. Browser viewport override reset afterward.
- No runtime warnings/errors on final reloaded browser run.
- Download-path verification and high-detail character animation remain outside the verified deliverable; source implementation and CSV content are complete.
