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

get(ref(db, 'system/versions')).then((snapshot) => {
  console.log("Data exists:", snapshot.exists());
  if (snapshot.exists()) {
    console.log(snapshot.val());
  }
}).catch((error) => {
  console.error("Firebase Error:", error.message);
}).finally(() => process.exit(0));
