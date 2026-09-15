import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { api } from './api';
import type { AuthTokens } from '@meal-rescue/shared-types';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

// Google rejects custom schemes (`mealrescue://`) for Web clients, so the auth
// request redirects to the Expo auth proxy (an https:// public-TLD URL). The
// proxy completes the browser handshake, then forwards the callback to the
// app's local custom-scheme URL below.
const GOOGLE_REDIRECT_URI = 'https://auth.expo.io/@loujan_b/meal-rescue';

const LOCAL_RETURN_URL = AuthSession.makeRedirectUri({
  scheme: 'mealrescue',
  path: 'expo-auth-session',
});

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export async function signInWithGoogle(): Promise<AuthTokens | null> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    console.warn('Google Web Client ID not configured');
    return null;
  }

  console.log('[google-auth] START clientId set, localReturnUrl =', LOCAL_RETURN_URL);

  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
    redirectUri: GOOGLE_REDIRECT_URI,
    scopes: ['openid', 'profile', 'email'],
    responseType: AuthSession.ResponseType.Code,
  });

  const authUrl = await request.makeAuthUrlAsync(discovery);
  console.log('[google-auth] authUrl =', authUrl);
  console.log('[google-auth] state =', request.state, 'codeVerifier set =', Boolean(request.codeVerifier));

  // Route the auth request through the Expo proxy start URL so Google only
  // ever sees the https:// redirect URI it was configured with.
  const startUrl = `${GOOGLE_REDIRECT_URI}/start?${new URLSearchParams({
    authUrl,
    returnUrl: LOCAL_RETURN_URL,
  })}`;
  console.log('[google-auth] startUrl =', startUrl);

  const result = await WebBrowser.openAuthSessionAsync(startUrl, LOCAL_RETURN_URL);
  console.log('[google-auth] openAuthSessionAsync result =', JSON.stringify(result));

  if (result.type === 'success') {
    const parsed = request.parseReturnUrl(result.url) as {
      type: 'success';
      params: Record<string, string>;
    };
    console.log('[google-auth] parsed params =', JSON.stringify(parsed.params));
    const code = parsed.params?.code;
    if (code) {
      try {
        const tokens = await exchangeGoogleCode(code, request.codeVerifier);
        console.log('[google-auth] exchange OK, user =', tokens.user?.email);
        return tokens;
      } catch (err) {
        console.log(
          '[google-auth] exchange FAILED state =',
          request.state,
          'verifier provided =',
          Boolean(request.codeVerifier),
          'err =',
          String(err),
        );
        throw err;
      }
    }
  }

  console.log('[google-auth] END without tokens');
  return null;
}

async function exchangeGoogleCode(
  code: string,
  codeVerifier?: string,
): Promise<AuthTokens> {
  const res = await api.post<AuthTokens>('/api/v1/auth/google', {
    code,
    redirectUri: GOOGLE_REDIRECT_URI,
    codeVerifier,
  });
  return res.data;
}