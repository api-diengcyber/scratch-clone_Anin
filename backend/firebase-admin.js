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
// SERVICE ACCOUNT (opsional di mode dummy — langkah 1 belum perlu Firebase)
// Backend TETAP boot tanpa file ini; verifyFirebaseToken gagal ramah.
// ============================================================

const serviceAccountPath = path.join(
    __dirname,
    "dieng-cyber-coding-firebase-adminsdk-fbsvc-b6d234f528.json"
);

let app = null;
let firebaseAuth = null;
let firestore = null;

try {
    const serviceAccount = require(serviceAccountPath);
    app = getApps().length
        ? getApps()[0]
        : initializeApp({
            credential: cert(serviceAccount)
        });
    firebaseAuth = getAuth(app);
    firestore = getFirestore(app);
} catch (e) {
    console.warn("[WARN] Firebase Admin tidak dikonfigurasi:", e.message);
}

module.exports = {
    app,
    firebaseAuth,
    firestore
};
