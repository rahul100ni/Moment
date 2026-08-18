# ⚡ Moment — Deep-Work Study Engine & Accountability Platform

> **Moment** is a highly resilient, cross-platform productivity and study engine designed for deep work. Built on a wall-clock anchored cross-tab synchronization system, it provides an unbreakable focus environment. Moment transforms overwhelming curriculums into manageable, gamified daily targets, while offering frictionless, real-time accountability through zero-login live sharing.

---

## ✨ Features

- **⏱️ The Unbreakable Focus Engine**: A stopwatch anchored to wall-clock timestamps (`sessionStartTs`). Impervious to browser sleep, tab throttling, or accidental refreshes.
- **🔄 Cross-Tab Leader Election**: Powered by the `BroadcastChannel` API—only the leader tab manages the interval loop while all other tabs stay in lockstep without duplicate ticks.
- **📚 Modular Curriculum Tracking**: Dynamic, section-by-section syllabus tracking with lecture duration calculations and automated completion analytics.
- **🎯 Dynamic Daily Goals**: Visual color progression (Indigo $\rightarrow$ Amber $\rightarrow$ Emerald) as you approach and crush your daily study targets.
- **🔥 Habit & Streak Tracking**: Automated daily study logs, session duration history, and streak counter for consecutive days of deep focus.
- **🔗 Zero-Login Study Buddy Live View**: Share a secure, real-time dashboard link with friends, study groups, or mentors (`/live?u=username`) with **zero login required** for the viewer.
- **💾 Dual-Layer Persistence**: Instant-response local storage coupled with real-time Firebase cloud synchronization.

---

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), [Lucide React](https://lucide.dev/)
- **Bundler & Tooling**: [Vite](https://vitejs.dev/)
- **Real-Time Backend**: [Firebase Realtime Database](https://firebase.google.com/products/realtime-database)
- **Multi-Tab Sync**: Web `BroadcastChannel` API
- **Mobile Target**: [Capacitor](https://capacitorjs.com/) (Android Foreground Service, Lock Screen Controls, Widgets)

---

## 🚀 Quick Start (Local Development)

### 1. Clone & Navigate
```bash
git clone https://github.com/rahul100ni/Moment.git
cd Moment
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
```

---

## 🌐 Production Build & Deployment

### Build
```bash
npm run build
```
The production bundle will be generated in `dist/`.

### Zero-Config Vercel Deployment
1. Import repository into [Vercel](https://vercel.com).
2. Framework Preset: **Vite**.
3. Deploy!

---

## 📖 Documentation & Architecture

- **[VISION.md](./VISION.md)**: Product vision, mission, core pillars, and long-term roadmap.
- **[brainstorm.md](./brainstorm.md)**: Technical architecture, Firebase multi-user schema, security rules, and Android Capacitor implementation specifications.

---

## 📄 License
MIT © Rahul
