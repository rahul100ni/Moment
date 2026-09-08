import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAHgcnuJfcjpGzLR5LW1gEATW4R9VqsVks",
  authDomain: "moment-focus.firebaseapp.com",
  databaseURL: "https://moment-focus-default-rtdb.firebaseio.com",
  projectId: "moment-focus",
  storageBucket: "moment-focus.firebasestorage.app",
  messagingSenderId: "986100474683",
  appId: "1:986100474683:web:2e4c2ed8fd6f5ed75f8d1e",
  measurementId: "G-4S0GEP7SLG"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

console.log("Testing Moment Firebase connection to moment-focus...");

get(ref(db, 'users/default_user/liveStats'))
  .then((snapshot) => {
    console.log("Success! Data connected from moment-focus:", snapshot.val());
    process.exit(0);
  })
  .catch((error) => {
    console.error("Firebase Error:", error);
    process.exit(1);
  });
