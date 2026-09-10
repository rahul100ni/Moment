# Phase 2, Step 1: The Lobby System (Onboarding)

## 1. Goal & Vision
Transition the app from a single-player experience with hardcoded data sync into a fully dynamic, 2-player "Conjoined Space". We will build a frictionless, premium dark-mode onboarding screen (The Lobby) that gates the main application. Users must either create a new room or join an existing one using a 6-digit ephemeral code. 

## 2. Local State Management
Upon first boot, the app will establish the user's local identity:
- `study_buddy_device_id`: A unique UUID generated locally (e.g., using `crypto.randomUUID()`) to represent this user/device.
- `study_buddy_room`: The 6-digit alphanumeric code representing their paired connection.

In `App.jsx`, we will introduce an `isPaired` state based on the existence of a valid room in `localStorage`. If `!isPaired`, the user is locked into the Lobby screen.

## 3. Firebase Realtime Database Architecture
We will introduce a highly structured `rooms/` node to dynamically link the two partners:

```json
rooms/
  ├── {6_digit_code}/                     // e.g., "839-204"
        ├── createdAt: <timestamp>
        └── members/
              ├── {device_A_uuid}/        // Created when User A clicks "Create"
              │     ├── role: "creator"
              │     ├── joinedAt: <timestamp>
              │     └── liveStats: { ... } // Replaces old users/rahul/liveStats
              └── {device_B_uuid}/        // Created when User B clicks "Join"
                    ├── role: "partner"
                    ├── joinedAt: <timestamp>
                    └── liveStats: { ... }
```

## 4. UI Components & Flow

### `Lobby.jsx` (New Component)
A sleek, glassmorphic onboarding experience matching the app's AMOLED black, purple, and emerald aesthetic. 

**State 1: Selection**
Two prominent action cards:
*   **Create Room**: Generates the code and opens the room.
*   **Join Partner**: Opens an input field to enter a code.

**State 2: Creator Waiting Room**
*   App generates a random code (e.g., `839-204`).
*   Writes `device_A_uuid` to Firebase.
*   Displays the code in large, glowing typography.
*   A real-time listener watches the `members/` node. Once `Object.keys(members).length === 2`, a strong haptic click (`Haptics.impact({ style: ImpactStyle.Heavy })`) fires, and the app transitions to the dashboard.

**State 3: Joiner Input**
*   A clean, centered OTP-style input for the 6-digit code.
*   Validates the room's existence and ensures it has `< 2` members.
*   Writes `device_B_uuid` to the room's `members/` node.
*   Fires a haptic success click and transitions to the dashboard.

## 5. App.jsx Integration (Routing)
*   **Boot Check**: Evaluate if `localStorage.getItem('study_buddy_room')` exists.
*   **Gatekeeper**: If false, render `<Lobby onPairSuccess={handlePairSuccess} />`.
*   **The Handshake**: `handlePairSuccess(roomCode)` saves the room to `localStorage` and updates the `isPaired` state, fading the Lobby out and smoothly fading in the Main App (`FocusTab` and `LiveSyncTab` navigation).
*   **Developer Hatch**: We will add a hidden developer tap-zone to easily clear `localStorage` and disconnect the room for easy testing of the onboarding flow.

## 6. Next Steps
Once approved, I will:
1. Create `app/src/components/Lobby.jsx`.
2. Refactor `app/src/App.jsx` to include the Lobby gatekeeper and pairing state.
3. Add the Firebase RTDB write/read logic for the 6-digit code generation and room joining.
