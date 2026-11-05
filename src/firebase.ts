import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDrKmAeW0SVz4gTStuUYca5xR6yfmIP4Jc",
  authDomain: "rifa-bezerro.firebaseapp.com",
  projectId: "rifa-bezerro",
  storageBucket: "rifa-bezerro.firebasestorage.app",
  messagingSenderId: "500412733126",
  appId: "1:500412733126:web:e9cbb1ee96df7009d3a9c7"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);