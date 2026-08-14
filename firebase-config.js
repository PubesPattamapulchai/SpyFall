// Firebase Web config is safe to ship in a browser app; access control lives in firebase.rules.json.
// This package is preconfigured to reuse the existing project from the source games.
// Replace these values if you want a completely separate Firebase project for Spyfall.
export const firebaseConfig = {
  apiKey: "AIzaSyBSjNbLUsrJ0oFOBebIDW2YFkfgNO26j2I",
  authDomain: "werewolf-board-game-9b361.firebaseapp.com",
  databaseURL: "https://werewolf-board-game-9b361-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "werewolf-board-game-9b361",
  storageBucket: "werewolf-board-game-9b361.firebasestorage.app",
  messagingSenderId: "874116696252",
  appId: "1:874116696252:web:4a5cd6e45f745f9adba8b9"
};

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId);
}
