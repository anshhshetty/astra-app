# Astra

A food, protein, gym, running and swimming tracker made for iPhone. Astra is an installable web app (PWA). It costs nothing to run, and there is no server: each person's data stays on their own phone.

## What it does

- **Food:** log meals from a food photo, a typed sentence, a barcode, a search or by hand. It includes about 170 Indian and gym foods, with Hindi names.
- **AI food scan:** take a photo, enter the weight, and get calories and protein. You can check the values on Google before saving.
- **Gym:** log workouts, sets and body weight.
- **Running and swimming:** each user picks the sports they want. Runs get a GPS map, and calories burned are estimated.
- **Streaks:** food, protein, calories, gym, run, swim, water and overall activity.
- **Progress:** weekly and monthly goal dashboards.
- **Astra Coach:** a chatbot for food and gym questions. It can also make a daily diet plan with calorie, protein and fat goals.
- **Downloads:** Excel, CSV and PDF reports, diet plans, full backups and restore.
- **Share cards:** Astra-branded cards with your photo and run map.
- **Profile:** a big user name, a profile photo and your own picture on the home screen.

## Run it on a computer

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the unit tests |
| `npm run build` | Makes the production files in `dist/` |
| `npm run preview` | Serves the production build on port 4173 |

## Where the data lives

- All user data is stored on the phone in IndexedDB, through Dexie.
- The database is still named `roti-reps`, the app's first name. Do not rename it, or existing users lose access to their data and old backups stop restoring.
- Phone storage belongs to one web address. Changing the address gives the phone a new, empty app, so use **More > Downloads and backup > Full backup** first and restore it afterwards.
- An app added to the iPhone Home Screen has its own storage, separate from Safari.

## Deploy for free

1. Run `npm run build`.
2. In the Cloudflare dashboard, go to **Workers & Pages** and open the existing project.
3. Choose **New deployment** and upload the contents of `dist/`.

Always update the same project. A new project gets a new address, which means empty data on the phone.

## Online services

The phone calls these directly. There is no server in between.

| Service | Used for | Key |
| --- | --- | --- |
| Google Gemini API | Food photos, typed meals, Astra Coach, diet plans and checking food values on Google | Each user adds their own free key in the app |
| OpenStreetMap | Map tiles for runs | None |
| Open Food Facts | Packaged food search and barcodes | None |

**Keep keys out of this repo.** The Gemini key is saved only on the user's phone. It is left out of backups and exports, and should never be committed.

## Project layout

```text
src/
  screens/      Full screens: Today, Train, Gym, Progress, More, AddFood, Coach, Onboarding
  components/   Shared UI, charts, the 3D barbell, artwork and the logo
  lib/          Database, Gemini, streaks, stats, GPS, maps, share cards and exports
  data/         Built-in foods and exercises
test/           Unit tests
scripts/        Icon and test data generators
public/         App icons
```

## Good to know

- Built-in food values are typical values, and users can edit them. AI results are estimates.
- iPhone stops GPS when the screen locks or you switch apps, so keep Astra open during a run.
- Google login and cloud saving are not built yet.

## License

The code is under the [MIT License](LICENSE). The Astra name and logo are not covered by this license.
