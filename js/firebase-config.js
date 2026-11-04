/* Cuenta compartida de staff: el operador solo escribe el código (la contraseña de esta cuenta en Authentication). */
window.STAFF_EMAIL = 'mesa@torneo.hoopz';

/* Configuración pública del proyecto Firebase (no es secreta; la seguridad la dan las reglas de Firestore y el login).
   Para probar con datos locales de ejemplo sin tocar la nube, abre cualquier página con ?local=1 (y ?local=0 para volver). */
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAwuS5GcglSChjkJ7Xa4c3MZkhzoSunmFQ',
  authDomain: 'torneo-7aefe.firebaseapp.com',
  projectId: 'torneo-7aefe',
  storageBucket: 'torneo-7aefe.firebasestorage.app',
  messagingSenderId: '827242435321',
  appId: '1:827242435321:web:5e7b5f3933488b8d050828'
};
