# GyanSetu Technical Change Report

Date: July 20, 2026
Project: GyanSetu
Prepared for: Submission, review, and technical approval

## 1. Executive Summary

This report documents the major technical issues identified in the GyanSetu application, the corrective changes implemented, the testing performed, and the current verified status of the system.

The work focused on improving:

- application startup reliability
- authentication and role handling
- teacher and student workflow correctness
- Firebase and Firestore runtime behavior
- Android compatibility
- UI responsiveness and button reliability
- live classroom features such as session updates, notifications, QR access, and AI support

The application has been updated to a more stable and review-ready state, and the latest production build and Android sync both complete successfully.

## 2. Project Context

GyanSetu is a classroom interaction platform designed to support real-time communication between teachers and students. The application includes:

- teacher and student login
- live session creation and joining
- QR-based classroom access
- student understanding signals
- anonymous question flow
- silent requests
- teacher announcements and updates
- study material sharing
- AI-assisted classroom support
- live notifications

The app is built with:

- React
- TypeScript
- Vite
- Firebase Authentication
- Firebase Firestore
- Capacitor Android
- Gemini API
- Tailwind CSS

## 3. Major Issues Identified

### 3.1 Startup and Android Stability

Earlier app versions showed:

- white-screen startup behavior
- delayed first render
- emulator crashes
- renderer pressure due to heavy initial bundle loading

### 3.2 Authentication and Role Issues

The authentication flow showed multiple problems:

- teacher selection was not available on the normal sign-in screen
- the selected role could be lost during auth handoff
- stale local role state could affect later auth attempts
- successful login could still feel stuck before the workspace opened

### 3.3 Session Flow Issues

Session-related issues included:

- `Create or open session` appearing unresponsive
- delays before entering teacher workspace
- missing validation around session actions

### 3.4 Firebase and Firestore Runtime Issues

The app encountered:

- Firebase configuration problems
- Firestore offline/client errors in Android WebView
- potential live-sync failures due to WebView transport behavior

### 3.5 Slow or Unreliable Button Actions

During code audit and feature tracing, several interaction risks were identified:

- dead or misleading buttons
- actions reporting success even when result was uncertain
- missing validation before submission
- asynchronous flows that could remain stuck on loading states

### 3.6 Performance Concerns

The application felt slow on phone in several scenarios because of:

- unnecessary teacher-grade subscriptions on student flows
- large bundle loading at startup
- heavy dashboard rendering on native phone screens
- AI and QR features loading too early

## 4. Corrective Changes Implemented

### 4.1 Startup and Bundle Optimization

Changes made:

- reduced startup weight for native flow
- moved heavier features behind lazy loading
- delayed Gemini loading until AI interaction
- delayed QR generation until required
- kept analytics optional on native phone screens instead of loading them immediately

Impact:

- lighter initial render
- less pressure on Android WebView startup
- improved phone stability compared to earlier builds

### 4.2 Authentication and Role Handling Improvements

Files involved:

- `src/lib/auth.ts`
- `src/UnifiedApp.tsx`

Changes made:

- added visible teacher/student role selection on both `Sign in` and `Create account`
- ensured the selected role is preserved during optimistic auth handoff
- added pending-role storage and cleanup logic
- cleared stale temporary role values when auth fails
- improved immediate profile fallback during login
- reduced cases where user remained stuck at `Opening your workspace...`

Impact:

- teacher login path behaves more consistently
- student/teacher selection is now visible and actionable in both auth modes
- fewer role mismatches during sign-in

### 4.3 Session Creation and Join Flow

Files involved:

- `src/UnifiedApp.tsx`
- `src/lib/session-store.ts`

Changes made:

- teacher session opening now navigates immediately
- backend seeding runs in background instead of blocking the UI
- join and create actions show clearer busy states
- session flow status messages were improved

Impact:

- teacher lobby feels more responsive
- reduced perception that `Create or open session` is broken

### 4.4 Firebase and Firestore Reliability

Files involved:

- `src/lib/firebase.ts`
- `src/lib/session-store.ts`

Changes made:

- configured Android-safe Firestore long polling
- improved fallback behavior when Firebase or Firestore is slow
- maintained demo-safe behavior when live sync is unavailable

Impact:

- fewer Android-specific Firestore connectivity problems
- improved stability in WebView-based runtime

### 4.5 Notification and Push-Like Behavior

Files involved:

- `src/lib/notifications.ts`
- `src/lib/session-store.ts`
- `src/UnifiedApp.tsx`

Changes made:

- added runtime-safe notification permission requests
- added runtime-safe notification delivery handling
- wired teacher answer events to student-facing notifications
- wired study material sharing to student notification feed
- preserved notification filtering by audience and recipient

Impact:

- safer notification flow
- improved teacher-to-student update visibility
- reduced risk of unhandled runtime notification errors

### 4.6 Teacher Controls and Student Actions

Files involved:

- `src/UnifiedApp.tsx`
- `src/components/TeacherDashboard.tsx`

Changes made:

- blocked blank teacher session updates
- blocked blank student question submission
- improved success/failure messaging for session updates
- added stronger async handling for AI chat
- prevented AI chat from remaining stuck in loading state
- disabled AI action while request is in progress

Impact:

- clearer user feedback
- safer form behavior
- fewer misleading success messages

### 4.7 Teacher Dashboard and Dead Control Fixes

Files involved:

- `src/components/TeacherDashboard.tsx`

Changes made:

- audited question filter and moderation buttons
- checked silent request action flow
- fixed the archive `Open report` button which previously had no real behavior
- added a report detail panel for archive opening

Impact:

- removed one confirmed dead button
- teacher dashboard is now more complete and consistent

### 4.8 Performance-Specific Runtime Improvements

Files involved:

- `src/lib/session-store.ts`
- `src/UnifiedApp.tsx`

Changes made:

- student users no longer load the full teacher-only Firestore collections
- limited some realtime queries for lighter phone behavior
- reduced live subscription load on student side
- separated native teacher analytics from default teacher workspace display

Impact:

- reduced unnecessary realtime data processing
- improved responsiveness for student paths
- improved phone usability compared to earlier versions

## 5. Testing Performed

### 5.1 White-Box Testing

A detailed code-path review was performed across:

- auth flow
- session lobby
- teacher workspace
- teacher dashboard
- student workspace
- notification flow
- AI helper flow
- Firestore write/update handlers

Focus areas included:

- button handlers
- missing guards
- dead buttons
- stuck loading states
- role mismatches
- error propagation
- async completion behavior

### 5.2 Black-Box / Scenario-Based Testing

Scenario-based behavior review covered:

- sign in
- create account
- teacher role selection
- student role selection
- create/open session
- join session
- push session update
- send announcement
- share study material
- send understanding signal
- send slow-down signal
- send student question
- send silent request
- mark question answered
- approve/dismiss silent requests
- open archive report
- use AI chat

### 5.3 Build Verification

Verified successfully:

- `npm run build`
- `npm run mobile:sync`

This confirms:

- TypeScript passed
- Vite production build passed
- Android asset sync passed

## 6. Key Findings from the Intensive Audit

The intensive audit found and resolved the following concrete issues:

1. Teacher selection missing on sign-in screen
2. Temporary role state not always cleaned after failed auth
3. Dead `Open report` button in teacher archive area
4. AI chat path could remain stuck in loading if an error occurred
5. Session update action could show success too optimistically
6. Student question action allowed empty submissions
7. Notification flow lacked runtime-safe protection in failure cases

These issues were corrected in the latest codebase.

## 7. Current Verified Status

Current codebase status:

- production build passes
- Android sync passes
- auth role flow improved
- teacher and student login UI improved
- session controls improved
- student classroom actions improved
- teacher dashboard controls improved
- notification and AI flows made safer

## 8. Remaining Risks and Limitations

Although the codebase is in a significantly improved state, the following risks still remain:

- real-device runtime behavior can still vary depending on network quality, Firebase latency, and Android WebView performance
- full push notifications for app-closed/background state are not equivalent to complete Firebase Cloud Messaging production setup unless configured separately
- no automated end-to-end UI test suite exists yet
- emulator-specific graphics/runtime instability may still occur independently of app logic

## 9. Recommendation for Submission / Review

For academic review or teacher approval, the current version is suitable to present as a stabilized working build with:

- real authentication flow
- teacher/student role selection
- live classroom workflow
- QR session support
- session updates and notifications
- AI classroom assistance
- improved runtime safety and button reliability

Recommended note during presentation:

"The app has gone through multiple rounds of debugging, optimization, and manual white-box and black-box testing. The current version focuses on stable classroom workflows, Firebase-backed live features, and improved Android usability."

## 10. Files Most Significantly Updated

- `src/UnifiedApp.tsx`
- `src/lib/auth.ts`
- `src/lib/firebase.ts`
- `src/lib/session-store.ts`
- `src/lib/notifications.ts`
- `src/components/TeacherDashboard.tsx`

## 11. Conclusion

The recent technical work on GyanSetu substantially improved the system’s reliability, usability, and review-readiness. The latest version resolves multiple high-impact auth, session, interaction, and runtime issues while preserving the core vision of a real-time classroom communication platform.

The application is now in a more professional, stable, and demonstrable state for academic submission, project presentation, and further iteration.
