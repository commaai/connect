const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDpL_CjvDG0AWyCm20D2osw1eDYEMMSJXc',
  authDomain: 'comma-web.firebaseapp.com',
  projectId: 'comma-web',
  storageBucket: 'comma-web.firebasestorage.app',
  messagingSenderId: '959079472803',
  appId: '1:959079472803:web:87f2d07bc8510eaa6aa916',
};

let messagingPromise = null;

export function getFirebaseMessaging() {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const [{ initializeApp }, { getMessaging, getToken, isSupported }] = await Promise.all([
        import('firebase/app'),
        import('firebase/messaging'),
      ]);
      if (!(await isSupported())) return null;
      const app = initializeApp(FIREBASE_CONFIG);
      return { messaging: getMessaging(app), getToken };
    })().catch((err) => {
      messagingPromise = null;
      throw err;
    });
  }
  return messagingPromise;
}
