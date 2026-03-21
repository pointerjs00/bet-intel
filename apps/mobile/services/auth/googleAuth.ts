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

export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  await GoogleSignin.hasPlayServices();
  const signInResult = await GoogleSignin.signIn();
  if (signInResult.type !== 'success') {
    throw new Error('O início de sessão com Google foi cancelado.');
  }

  const { idToken } = await GoogleSignin.getTokens();
  const googleCredential = auth.GoogleAuthProvider.credential(idToken);
  const userCredential = await auth().signInWithCredential(googleCredential);
  const firebaseIdToken = await userCredential.user.getIdToken();

  const response = await apiClient.post('/auth/google', { firebaseIdToken });
  return response.data.data as GoogleAuthResult;
}
