# Backend integration

The client talks to the Django backend (GraphQL, uploads, exports) through the development proxy in `proxy.conf.json` (`localhost:8000`), and to the AI engine (`localhost:8001`) directly for live camera analysis. URLs are set in `src/app/core/config/api.config.ts`.

## Authentication

`login(email, password)` returns a JWT (15 minutes) and the user. Every later GraphQL, upload, export and AI-engine request sends `Authorization: Bearer <token>`; the camera WebSocket passes it as `?token=`. Sessions end at token expiry. Officers change their own name (`updateMyProfile`) and password (`changePassword`) from the account menu.

## Screens

| Screen | Operations |
| --- | --- |
| Dashboards | `caseStats`, `alertStats`, `cameras`, `missingPersonCases`, `watchlistPersons`; managers/admins also `alerts`, `sightings`. The manager dashboard runs a quick photo search. |
| Missing persons (manager) | `missingPersonCases`, `caseOfficers`, upload, `createMissingPersonCase` / `updateMissingPersonCase`, `enrollFace` |
| Missing persons (investigator) | `missingPersonCases`, `updateCaseStatus` (OPEN → FOUND → CLOSED) |
| Watchlist (manager) | `watchlistPersons`, upload, `createWatchlistPerson` / `updateWatchlistPerson` (name is fixed after creation), `removeWatchlistPerson`, `enrollFace` |
| Alerts / sightings | `alerts` / `sightings` with names from `cameras` and persons; managers `confirm…` / `reject…` pending items. The queues poll every 10 s for new detections. |
| Movement timeline | `movementTimeline(subjectType, subjectId)` (confirmed detections only) |
| Face search | upload, then `searchByPhoto`; a match loads the person or case record |
| Camera preview | AI engine `GET /status` and `ws /ws/stream`. Frames from the browser camera are analysed; choosing a registered `browser` camera makes strong matches pending sightings/alerts. |
| Users (admin) | `users`, `createUser`, `updateUser`, `resetUserPassword`, `deactivateUser`, `activateUser` |
| Cameras (admin) | `cameras`, `createCamera`, `updateCamera`, `disableCamera` |
| Audit logs / reports (admin) | `auditLogs`, `auditLog`, `/exports/csv/`, `/exports/pdf/` |

## Rules enforced by the backend

- Watchlist entries and cameras are soft-removed; cases are never deleted and only move OPEN → FOUND → CLOSED.
- Detections can be reviewed once, while PENDING.
- Photos: JPEG, PNG or WebP up to 8 MB. The AI engine only reads photos from the TAMBUA media bucket.
- New passwords must pass Django's password validators (at least 8 characters, not common or all-numeric).
