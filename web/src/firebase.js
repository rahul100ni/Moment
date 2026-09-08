import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || "AIzaSyAHgcnuJfcjpGzLR5LW1gEATW4R9VqsVks",
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || "moment-focus.firebaseapp.com",
  databaseURL: import.meta.env?.VITE_FIREBASE_DATABASE_URL || "https://moment-focus-default-rtdb.firebaseio.com",
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || "moment-focus",
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || "moment-focus.firebasestorage.app",
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "986100474683",
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || "1:986100474683:web:2e4c2ed8fd6f5ed75f8d1e",
  measurementId: import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID || "G-4S0GEP7SLG"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export default app;
