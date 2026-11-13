import { initializeApp } from 'firebase/app';
import {
  deleteToken, getMessaging, getToken, isSupported,
} from 'firebase/messaging';

const app = initializeApp({
  apiKey: 'AIzaSyDpL_CjvDG0AWyCm20D2osw1eDYEMMSJXc',
  authDomain: 'comma-web.firebaseapp.com',
  projectId: 'comma-web',
  storageBucket: 'comma-web.firebasestorage.app',
  messagingSenderId: '959079472803',
  appId: '1:959079472803:web:87f2d07bc8510eaa6aa916',
});

export async function getFcmToken(serviceWorkerRegistration) {
  if (!(await isSupported())) return null;
  return getToken(getMessaging(app), { serviceWorkerRegistration });
}

export async function deleteFcmToken(serviceWorkerRegistration) {
  if (!(await getFcmToken(serviceWorkerRegistration))) return;
  await deleteToken(getMessaging(app));
}
