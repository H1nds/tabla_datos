// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBp8Oyceglim1N_Q_hWMCPYGKQQfLZF1A8",
    authDomain: "tabla-empresa.firebaseapp.com",
    projectId: "tabla-empresa",
    storageBucket: "tabla-empresa.firebasestorage.app",
    messagingSenderId: "596877350985",
    appId: "1:596877350985:web:e7fdec11ae6c3df99a0798"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
