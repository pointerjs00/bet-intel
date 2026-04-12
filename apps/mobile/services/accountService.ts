import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ApiResponse,
  ChangePasswordInput,
  PublicUser,
  SetPasswordInput,
} from '@betintel/shared';
import { useAuthStore } from '../stores/authStore';
import { getGoogleFirebaseIdToken } from './auth/googleAuth';
import { apiClient } from './apiClient';
import { socialQueryKeys } from './socialService';

function requireData<T>(data: T | undefined): T {
  if (!data) {
    throw new Error('Resposta inválida do servidor.');
  }

  return data;
}

async function syncAuthenticatedUser(queryClient: ReturnType<typeof useQueryClient>, user: PublicUser) {
  useAuthStore.getState().updateUser(user);
  queryClient.setQueryData(socialQueryKeys.me, user);
  await queryClient.invalidateQueries({ queryKey: socialQueryKeys.me });
}

/** Links the currently authenticated BetIntel account to a Google identity. */
export function useLinkGoogleAccountMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const firebaseIdToken = await getGoogleFirebaseIdToken();
      const response = await apiClient.post<ApiResponse<{ user: PublicUser }>>('/auth/google/link', {
        firebaseIdToken,
      });
      return requireData(response.data.data).user;
    },
    onSuccess: async (user) => {
      await syncAuthenticatedUser(queryClient, user);
    },
  });
}

/** Unlinks Google from the authenticated account when a password fallback exists. */
export function useUnlinkGoogleAccountMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<ApiResponse<{ user: PublicUser }>>('/auth/google/unlink');
      return requireData(response.data.data).user;
    },
    onSuccess: async (user) => {
      await syncAuthenticatedUser(queryClient, user);
    },
  });
}

/** Sets a password for Google-only users and promotes the account to HYBRID. */
export function useSetPasswordMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SetPasswordInput) => {
      const response = await apiClient.post<ApiResponse<{ user: PublicUser }>>('/auth/set-password', payload);
      return requireData(response.data.data).user;
    },
    onSuccess: async (user) => {
      await syncAuthenticatedUser(queryClient, user);
    },
  });
}

/** Changes the current account password and invalidates all active sessions on success. */
export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: async (payload: ChangePasswordInput) => {
      const response = await apiClient.post<ApiResponse<{ message: string }>>('/auth/change-password', payload);
      return requireData(response.data.data);
    },
  });
}

/** Uploads a base64-encoded avatar image and updates the user's profile. */
export function useUploadAvatarMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { base64: string; mimeType: string }) => {
      const response = await apiClient.post<ApiResponse<PublicUser>>('/users/me/avatar', payload);
      return requireData(response.data.data);
    },
    onSuccess: async (user) => {
      await syncAuthenticatedUser(queryClient, user);
    },
  });
}

/** Removes the user's avatar. */
export function useDeleteAvatarMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.delete<ApiResponse<PublicUser>>('/users/me/avatar');
      return requireData(response.data.data);
    },
    onSuccess: async (user) => {
      await syncAuthenticatedUser(queryClient, user);
    },
  });
}