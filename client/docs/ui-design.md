# e-TAMBUA interface

The landing page at / links to /login. The palette follows the supplied camera-vision reference: near-black teal, cyan accents and cool light surfaces. Both themes share these colors. Theme choice persists across navigation and tabs; the initial choice follows the device preference. Translucent headers, evidence badges and the login panel use solid alpha colors and backdrop blur, without gradients.

The logo has a transparent background and separate light/dark versions for legibility. SVG and ICO favicons use the transparent eye symbol.

## Camera-vision image

Saved asset: public/images/e-tambua-camera-vision.png.

Method: built-in image generation. This is conceptual promotional imagery, not real detection evidence or a claim that backend matching is operational.

Prompt:

> undefined

## Investigator sightings

/investigator/sightings lists confirmed sightings for a selected missing-person case using movementTimeline(MISSING_PERSON, subjectId). The documented backend restricts the general sightings query to managers and administrators. Case records link directly to the appropriate sightings view. Investigators can inspect snapshots and available clips; confirmation and rejection remain manager actions.

The timeline cancels stale requests on case changes, provides case-list retries, distinguishes filtered results from an empty timeline and exposes the evidence details dialog. A missing or failed video falls back to its snapshot.

## Verification

Desktop and mobile Chrome checks use simulated API responses and cover both themes, transparent logo selection, sightings, evidence details and viewport overflow. These checks do not verify the backend on the other computer.

The full suite reports 51 passing tests and 24 route-protection failures. Those failures are caused by guard configuration already commented out in app.routes.ts; the comments and disabled state have been preserved as requested. Production compilation succeeds with component CSS size warnings.
