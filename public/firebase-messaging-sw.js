importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB1cSf6eAscvtCt-JUkwfJG4sbZUcGs8ug",
  authDomain: "rios-care-hub.firebaseapp.com",
  projectId: "rios-care-hub",
  storageBucket: "rios-care-hub.firebasestorage.app",
  messagingSenderId: "1089802073379",
  appId: "1:1089802073379:web:8601602afa90a44a4c0896"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Background message received:', payload);
  
  const notificationTitle = payload.notification?.title || 'RIOS';
  const notificationOptions = {
    body: payload.notification?.body || 'Nova notificação',
    icon: '/logo.png',
    badge: '/logo.png',
    data: payload.data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
