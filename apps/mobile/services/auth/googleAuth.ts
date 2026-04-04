import { GoogleSignin } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';
import { apiClient } from '../apiClient';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

export interface GoogleAuthResult {
  accessToken?: string;
  refreshToken?: string;
  user?: unknown;
  isNewUser: boolean;
  tempToken?: string;
}

async function requestGoogleFirebaseIdToken(): Promise<string> {
  await GoogleSignin.hasPlayServices();
  const signInResult = await GoogleSignin.signIn();
  if (signInResult.type !== 'success') {
    throw new Error('O início de sessão com Google foi cancelado.');
  }

  const { idToken } = await GoogleSignin.getTokens();
  if (!idToken) {
    throw new Error('Google Sign-In: idToken em falta. Verifique a configuração do webClientId.');
  }
  const googleCredential = auth.GoogleAuthProvider.credential(idToken);
  const userCredential = await auth().signInWithCredential(googleCredential);
  return userCredential.user.getIdToken();
}

/** Opens the Google sign-in flow and returns a Firebase ID token verified by the API. */
export async function getGoogleFirebaseIdToken(): Promise<string> {
  return requestGoogleFirebaseIdToken();
}

export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  const firebaseIdToken = await requestGoogleFirebaseIdToken();
  const response = await apiClient.post('/auth/google', { firebaseIdToken });
  return response.data.data as GoogleAuthResult;
}
