# GyanSetu

GyanSetu is a React and Tailwind classroom interaction app with a live teacher dashboard, student feedback surface, silent requests, slow-down alerting, and Gemini-powered classroom pulse insights.

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- Framer Motion
- Lucide React
- Recharts
- Firebase Auth + Firestore
- Gemini via `@google/genai`

## Run locally

1. Install dependencies with `npm install`
2. Start the dev server with `npm run dev`

## Deploy and install on phone

- Deploy the app to a host with HTTPS such as Vercel
- Open the public URL on your phone
- On Android Chrome, use `Add to Home screen` or `Install app`
- On iPhone Safari, use `Share` -> `Add to Home Screen`

The project now includes a web manifest and service worker so it behaves like an installable PWA once deployed over HTTPS.

## Vercel setup

1. Claim the current deployment in your Vercel account
2. Import or link this project in Vercel
3. Add the variables from `.env.example` in the Vercel project settings
4. Redeploy after the environment variables are saved

## Firebase live session wiring

The app now reads and writes live classroom data from Firestore under:

- `sessions/{sessionId}`
- `sessions/{sessionId}/pulseHistory`
- `sessions/{sessionId}/slowdownSignals`
- `sessions/{sessionId}/questions`
- `sessions/{sessionId}/requests`
- `sessions/{sessionId}/archives`
- `sessions/{sessionId}/studentSignals`

The web app uses `VITE_FIREBASE_SESSION_ID` to choose the live classroom session.
If the root session document does not exist yet, the app seeds basic metadata automatically.

Student actions now write live data:

- feedback buttons increment `studentSignals`
- slow-down creates or updates the current minute bucket in `slowdownSignals`
- question form adds a document to `questions`
- silent request form adds a document to `requests`

Teacher actions now write live data too:

- question cards can be marked `answered`, `flagged`, or reopened
- silent requests can be approved or dismissed

## Android app build

This project includes a Capacitor Android wrapper in `android/`.

1. Run `npm install`
2. Run `npm run mobile:sync`
3. Open Android Studio with `npm run mobile:open`
4. In Android Studio, build a debug APK or generate a signed release APK

App identifiers:

- Application ID: `com.gyansetu.app`
- App name: `GyanSetu`

Release signing:

1. Copy `android/keystore.properties.example` to `android/keystore.properties`
2. Put your release keystore file inside `android/app/`
3. Update the passwords and alias in `android/keystore.properties`
4. Build a signed release from Android Studio or Gradle

The Android project now includes:

- release signing config hook in `android/app/build.gradle`
- resource shrinking and minification for release builds
- backup and data extraction rules
- network security config with cleartext disabled

## Optional environment variables

Create a `.env` file and add:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_GEMINI_API_KEY=
VITE_PUBLIC_APP_URL=
```

`VITE_PUBLIC_APP_URL` is used to generate QR join links that point to your deployed app instead of `localhost`.

Without keys, the app cannot use real Firebase auth or live classroom sync.
