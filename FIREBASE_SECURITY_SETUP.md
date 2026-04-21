# Firebase Security Setup

## What Was Added

- `firestore.rules`
- `firebase.json`

These rules are designed to tighten GyanSetu's Firestore access so:

- users only manage their own user profile
- teachers own session metadata updates
- students can create questions and silent requests
- notifications are restricted more tightly by role
- destructive deletes are blocked by default

## Important

App-side code helps, but real data security depends on Firestore rules being deployed.

## Deploy the Rules

If Firebase CLI is installed and you are logged in:

```bash
firebase deploy --only firestore:rules
```

## Firebase Console Checks

Make sure these are enabled:

- Authentication -> Email/Password
- Firestore Database

## Current Security Notes

- Anonymous Firestore auth is now disabled by default in app code unless explicitly enabled with:

```env
VITE_ENABLE_FIREBASE_ANON_AUTH=true
```

- Keep that variable unset for the more secure default behavior.
