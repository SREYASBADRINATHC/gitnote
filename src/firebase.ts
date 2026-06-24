import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GithubAuthProvider, 
  signInWithPopup, 
  signInAnonymously,
  signOut, 
  User,
  browserPopupRedirectResolver
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  deleteDoc, 
  doc, 
  orderBy,
  Firestore
} from 'firebase/firestore';

// Configuration from firebase-applet-config.json
const firebaseConfig = {
  apiKey: "AIzaSyDjMlP_G8PwdJBVvLbgt4zjOF7k61-mnLk",
  authDomain: "eloquent-syntax-0k6kr.firebaseapp.com",
  projectId: "eloquent-syntax-0k6kr",
  storageBucket: "eloquent-syntax-0k6kr.firebasestorage.app",
  messagingSenderId: "461332694514",
  appId: "1:461332694514:web:326bd39aa1b2474329976b"
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore with explicit databaseId from config
const db: Firestore = getFirestore(app, "ai-studio-5292f0b8-637b-4915-921b-259bda468478");

const auth = getAuth(app);
const githubProvider = new GithubAuthProvider();
// Request repo access scope from GitHub provider if user wants to work with personal repos
githubProvider.addScope('repo');

export { 
  app, 
  auth, 
  db, 
  githubProvider, 
  GithubAuthProvider,
  signInWithPopup, 
  signInAnonymously,
  signOut, 
  browserPopupRedirectResolver,
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  deleteDoc, 
  doc, 
  orderBy 
};
export type { User };
