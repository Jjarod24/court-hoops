# Court Hoops

Build a web app called **CourtQuest** — a location-based basketball game where players find real-world basketball courts, complete shooting challenges there, and collect basketball cards based on their performance.




## Core Concept

Players use their phone's GPS to discover nearby basketball courts on an interactive map. At each court, they can start a "Challenge" (e.g., 5 free throws). Using the phone camera as an AR-style overlay, players log each shot as a make or miss by tapping on-screen buttons. Based on their final score, they earn basketball cards — the number of cards equals the number of shots made (e.g., 3/5 made = 3 cards, 5/5 made = 5 cards).




## Key Features




### 1. Court Discovery Map

- Interactive map (use a map library like Mapbox or Leaflet) centered on the user's current GPS location

- Pins marking nearby basketball courts, pulled from a courts database table

- Tapping a pin shows court details: name, address, distance, photo, difficulty rating, and available challenges

- "Check In" button that only activates when the user is within a set radius (e.g., 100m) of the court




### 2. AR Directional Navigation (Find the Court)

- Once a user selects a nearby court from the map (but hasn't arrived yet), they can tap "Navigate in AR"

- Opens the live camera feed with a floating arrow overlay that points toward the court's real-world direction in real time

- Calculate bearing from the user's current GPS coordinates to the court's coordinates, then compare it to the phone's compass heading (device orientation) to rotate the arrow so it always points the correct real-world direction as the user turns

- Below the arrow, show live distance remaining (e.g., "180m away") that updates as the user moves, plus a "Getting closer!" / "Getting colder" indicator based on distance deltas

- Arrow should smoothly animate/rotate rather than snap, and pulse or turn green when the user is within check-in range

- Request both Geolocation and Device Orientation permissions (iOS requires an explicit `DeviceOrientationEvent.requestPermission()` prompt) with a clear "Enable Compass" button, and gracefully fall back to just a distance + basic map direction if compass access is denied or unsupported

- This is a compass-based AR overlay (using GPS bearing + device heading), not markerless/visual AR — it doesn't need image recognition to work, which keeps it fully buildable as a web app




### 3. AR Camera Challenge Mode

- When checked in at a court, user can start a Challenge (e.g., "5 Free Throws")

- Opens the device camera as a live background (getUserMedia) with a simple AR-style HUD overlay (crosshair/hoop reticle graphic, shot counter, score tracker)

- After each attempt, user taps a "Made It" or "Missed" button to log the result

- Progress bar shows shots remaining (e.g., "Shot 3 of 5")

- On completion, show a results screen with score (e.g., "3/5 Hoops Made!")




### 4. Card Collection System

- Number of cards earned = number of successful shots in that challenge

- Cards are randomly drawn from a card pool with rarity tiers (Common, Rare, Epic, Legendary) — better courts or harder challenges have better odds for rare cards

- Each card has: player name/theme, artwork, rarity, stats, and the court/date it was earned at

- "Pack opening" animation when cards are revealed after a challenge

- Personal Card Collection page (grid/album view) showing all owned cards, duplicates stacked with a count badge, filter by rarity/court




### 5. User Profiles & Progression

- Sign up / login (email + social auth)

- Profile page showing: total cards collected, courts visited, total hoops made, current streak, level/XP bar

- Leaderboard (global and friends) ranked by cards collected or shooting accuracy




### 6. Challenges & Variety

- Multiple challenge types per court: Free Throws, 3-Pointers, Trick Shots, Timed Shootout

- Daily/weekly challenge rotation with bonus card rewards

- Difficulty scaling: harder challenges (more shots, further range) yield higher card rarity odds




## Data Model (Supabase)

- `users`: id, username, avatar, xp, level, created_at

- `courts`: id, name, lat, lng, address, photo_url, difficulty

- `challenges`: id, court_id, type, total_shots, difficulty

- `attempts`: id, user_id, challenge_id, shots_made, shots_total, completed_at

- `cards`: id, name, rarity, artwork_url, stats_json

- `user_cards`: id, user_id, card_id, earned_at, source_challenge_id




## Design Direction

- Bold, energetic sports-app aesthetic: dark navy/black base with orange/red basketball accent colors

- Card designs should feel collectible/premium (like trading cards — gradient borders for rare tiers, foil-style shimmer for legendary)

- Mobile-first responsive layout since this will primarily be used outdoors on phones

- Smooth transitions between map → court detail → camera challenge → results → card reveal




## Technical Notes

- Use the browser Geolocation API for player location and distance-to-court calculations

- Use the DeviceOrientationEvent API for compass heading, combined with a standard bearing formula (using the two lat/lng pairs) to calculate arrow rotation for the "find the court" AR navigation

- Use getUserMedia for the camera view (AR-style overlay is a graphic overlay, not true object-detection AR)

- Store court data in Supabase; seed with a handful of real local courts to start, with an admin form to add more

- Make shot-logging simple and tap-based (no automatic ball/hoop detection) — this keeps the app buildable as a web app while still feeling AR-inspired




## MVP Scope (build this first)

1. Map with court pins + geolocation

2. AR directional arrow navigation to a selected court (compass + GPS bearing)

3. Court check-in flow

4. One challenge type (Free Throws) with camera overlay + tap-to-log scoring

5. Card reward logic tied to shots made

6. Card collection page

7. Basic user auth + profile




Leave leaderboards, daily challenges, and multiple challenge types as fast-follow features after MVP is working.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c765bde9-3a05-4b8d-932c-a50d708b3541).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
