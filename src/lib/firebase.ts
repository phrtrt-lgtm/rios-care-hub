import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyB1cSf6eAscvtCt-JUkwfJG4sbZUcGs8ug",
  authDomain: "rios-care-hub.firebaseapp.com",
  projectId: "rios-care-hub",
  storageBucket: "rios-care-hub.firebasestorage.app",
  messagingSenderId: "1089802073379",
  appId: "1:1089802073379:web:8601602afa90a44a4c0896"
};

export const app = initializeApp(firebaseConfig);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

export { getToken, onMessage };
