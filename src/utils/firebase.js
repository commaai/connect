const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDpL_CjvDG0AWyCm20D2osw1eDYEMMSJXc',
  authDomain: 'comma-web.firebaseapp.com',
  projectId: 'comma-web',
  storageBucket: 'comma-web.firebasestorage.app',
  messagingSenderId: '959079472803',
  appId: '1:959079472803:web:87f2d07bc8510eaa6aa916',
};

let messagingPromise = null;

function getMessaging() {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const [{ initializeApp }, messaging] = await Promise.all([
        import('firebase/app'),
        import('firebase/messaging'),
      ]);
      if (!(await messaging.isSupported())) return null;
      return { messaging: messaging.getMessaging(initializeApp(FIREBASE_CONFIG)), getToken: messaging.getToken };
    })().catch((err) => {
      messagingPromise = null;
      throw err;
    });
  }
  return messagingPromise;
}

export async function getFcmToken(serviceWorkerRegistration) {
  const fcm = await getMessaging();
  return fcm && fcm.getToken(fcm.messaging, { serviceWorkerRegistration });
}
