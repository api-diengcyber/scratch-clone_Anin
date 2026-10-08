// ============================================================
// FIREBASE CONFIG
// Dieng Cyber Coding
// ============================================================

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import { getAuth } from
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import { getFirestore } from
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// ============================================================
// FIREBASE PROJECT
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyD9MeeZCxU8_k3fZrf9WF3XcCpZmWapncc",
  authDomain: "dieng-cyber-coding.firebaseapp.com",
  projectId: "dieng-cyber-coding",
  storageBucket: "dieng-cyber-coding.firebasestorage.app",
  messagingSenderId: "409549772117",
  appId: "1:409549772117:web:502b993d10bd7cb8748bdc"
};

// ============================================================
// INITIALIZE
// ============================================================

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);