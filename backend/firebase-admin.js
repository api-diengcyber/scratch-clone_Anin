const path = require("path");

const {
    initializeApp,
    cert,
    getApps
} = require("firebase-admin/app");

const {
    getAuth
} = require("firebase-admin/auth");

const {
    getFirestore
} = require("firebase-admin/firestore");

// ============================================================
// SERVICE ACCOUNT
// ============================================================

const serviceAccountPath = path.join(
    __dirname,
    "dieng-cyber-coding-firebase-adminsdk-fbsvc-b6d234f528.json"
);

const serviceAccount = require(serviceAccountPath);

// ============================================================
// INITIALIZE FIREBASE ADMIN
// ============================================================

const app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount)
    });

// ============================================================
// SERVICES
// ============================================================

const firebaseAuth = getAuth(app);
const firestore = getFirestore(app);

module.exports = {
    app,
    firebaseAuth,
    firestore
};