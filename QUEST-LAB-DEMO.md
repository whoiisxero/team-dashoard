# Quest Lab — workspace demo

Release scope: add the sample-data Quest Lab to the owner’s My workspace screen, Home and the full-page Quest Lab view. This release uses the existing connected deployment from main; no database migration or backend permission change is required.

Quest Lab adds two views without changing the existing Quest layout:

- Universe: a rotating 3D-projected sample network. Drag to orbit, scroll or pinch to zoom, click a node or use the picker to highlight its connections. Switch between Orbital, Spiral and Sphere, change detail, or filter a constellation.
- Forecast Lab: synthetic OHLC candles and 100 generated future paths over 24 bars. Switch BTC, ETH or gold and minute/hour/day intervals. Drag through history, zoom, inspect candles, or generate a new seeded scenario.

All nodes, labels, candles and future paths are generated locally. There are no exchange feeds, API calls, trained forecasting models, workspace data, AI-agent activity, measured forecast accuracy or trading actions. The P10–P90 range describes the generated scenario set; it is not a calibrated confidence interval. Timestamps use Africa/Johannesburg.

## Review the portable demo

Run:

    node scripts/build-quest-lab-demo.mjs

The output is /workspace/outputs/Quest-Lab-Demo.html. Download it and open it in a modern desktop browser. It is one self-contained file and needs no account, server, external libraries or internet connection. The ZIP download contains the same HTML plus brief instructions.

## Local Quest integration

The owner gets the complete Quest Lab section directly below the welcome area in My workspace, and below the globe on Home, with Universe and Forecast Lab tabs. Open full page moves the same surface into the Quest Lab page; The back button returns to the originating workspace or Home while preserving the selected tab, camera and scenario. The existing globe, country controls, connection panel and arcade remain in place. A shortcut is also available under Tools and in the page finder.\n\nThe Home and My workspace sections and the full-page route are hidden for other accounts. Only one renderer is mounted, its animation pauses off screen, on other routes and in a hidden document, and account changes destroy its state. Normal member access and existing pages are unchanged.

The standalone file contains the same renderer without sign-in. Sharing that file shares sample data only.

## Motion and input

Pause motion is available in both views. Reduced-motion preferences start the demo paused. Keyboard controls: arrows to orbit/pan; + and - to zoom; Space to pause; Home to reset; Escape to clear a node. Both tabs and the sample node picker support keyboard navigation.

Balanced detail uses 760 nodes on desktop and 320 on small screens, with a device-pixel-ratio cap and capped animation scheduling. These are visualization counts, not application usage metrics.

## Validation

- node --check quest-lab.js
- node --check navigation.js
- node --check team-access.js
- node scripts/build.mjs
- python tests/quest-lab-demo-browser.py
- python tests/sidebar-sections-browser.py\n- python tests/home-globe.py

The demo browser checks cover orbit, zoom, node picking, layouts, filters, density changes, forecast quantiles, seed changes, minute intervals, assets, crosshairs and chart navigation. They also cover a 390px touch viewport, reduced motion, offline operation with no external requests, paused/background animation, owner-only Home and My workspace integration, the permission-checked ?view=personalHome sign-in link, preserved state across embedded/full-page navigation, off-screen animation pausing and clearing on account changes.

Desktop and phone screenshots were reviewed. These are Chromium viewport checks; actual iPhone/Android device testing remains for a later release. Managed Chromium blocks file URLs, so the self-contained output was served through a locally intercepted test URL; offline tests fulfilled only that HTML with browser networking disabled.

## Before a live version

Review this demo first. Any real data connection or trained forecasting model is a separate milestone requiring source validation, historical evaluation and permission-scoped access. Production publication is authorized by the user's request to add the feature to Quest and My workspace.
\n## Release and rollback\n\nThe static build fingerprints all scripts and styles for coordinated app updates. The pre-feature main commit is a9bd532ebdd83d6e9dba5ca8a981be9d543b44be. Rollback can revert this feature commit without changing the database. A live version.json response should match the release hash printed by the static build.\n