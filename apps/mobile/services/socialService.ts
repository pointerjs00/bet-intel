import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiResponse,
  FriendFeedItem,
  FriendRequestDetail,
  FriendRequestsOverview,
  FriendshipDetail,
  Notification,
  NotificationsPageMeta,
  PaginationMeta,
  PublicProfile,
  PublicUser,
  UpdateProfileInput,
  UserSearchResult,
  UsernameAvailability,
} from '@betintel/shared';
import { apiClient } from './apiClient';

export const socialQueryKeys = {
  me: ['users', 'me'] as const,
  profile: (username: string) => ['users', 'public-profile', username] as const,
  search: (query: string) => ['users', 'search', query] as const,
  usernameAvailability: (username: string) => ['users', 'check-username', username] as const,
  friends: ['friends', 'list'] as const,
  friendRequests: ['friends', 'requests'] as const,
  friendFeed: ['friends', 'feed'] as const,
  notificationsRoot: ['notifications'] as const,
  notifications: (page: number, limit: number) => ['notifications', page, limit] as const,
};

/** Shared API error extractor for social and profile mutations. */
export function getApiErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'error' in error.response.data
  ) {
    return String(error.response.data.error);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Não foi possível concluir a operação.';
}

/** Returns the authenticated user's profile. */
export function useMeProfile() {
  return useQuery({
    queryKey: socialQueryKeys.me,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PublicUser>>('/users/me');
      return response.data.data as PublicUser;
    },
  });
}

/** Returns a public profile for a username. */
export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: socialQueryKeys.profile(username),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PublicProfile>>(`/users/${username}`);
      return response.data.data as PublicProfile;
    },
    enabled: Boolean(username),
  });
}

/** Searches users by username or display name. */
export function useUserSearch(query: string) {
  const normalized = query.trim();

  return useQuery({
    queryKey: socialQueryKeys.search(normalized),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<UserSearchResult[]>>('/users/search', {
        params: { query: normalized },
      });
      return response.data.data as UserSearchResult[];
    },
    enabled: normalized.length >= 2,
  });
}

/** Checks username availability for profile and onboarding flows. */
export function useUsernameAvailability(username: string) {
  const normalized = username.trim();

  return useQuery({
    queryKey: socialQueryKeys.usernameAvailability(normalized),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<UsernameAvailability>>('/users/check-username', {
        params: { username: normalized },
      });
      return response.data.data as UsernameAvailability;
    },
    enabled: normalized.length >= 3,
  });
}

/** Returns the current friend list. */
export function useFriends() {
  return useQuery({
    queryKey: socialQueryKeys.friends,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FriendshipDetail[]>>('/friends');
      return response.data.data as FriendshipDetail[];
    },
  });
}

/** Returns pending sent and received friend requests. */
export function useFriendRequests() {
  return useQuery({
    queryKey: socialQueryKeys.friendRequests,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FriendRequestsOverview>>('/friends/requests');
      return response.data.data as FriendRequestsOverview;
    },
  });
}

/** Returns the friend activity feed. */
export function useFriendFeed() {
  return useQuery({
    queryKey: socialQueryKeys.friendFeed,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FriendFeedItem[]>>('/friends/feed');
      return response.data.data as FriendFeedItem[];
    },
  });
}

/** Returns a paginated notifications page plus unread count metadata. */
export function useNotifications(page = 1, limit = 20) {
  return useQuery({
    queryKey: socialQueryKeys.notifications(page, limit),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Notification[]>>('/notifications', {
        params: { page, limit },
      });

      const meta = (response.data.meta?.pagination ?? response.data.meta) as NotificationsPageMeta | undefined;
      return {
        items: (response.data.data ?? []) as Notification[],
        meta: meta ?? {
          page,
          limit,
          total: response.data.data?.length ?? 0,
          totalPages: 1,
          unreadCount: 0,
        },
      };
    },
  });
}

/** Returns the unread notification count with a minimal payload query. */
export function useUnreadNotificationsCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Notification[]>>('/notifications', {
        params: { page: 1, limit: 1 },
      });

      const meta = (response.data.meta?.pagination ?? response.data.meta) as NotificationsPageMeta | undefined;
      return meta?.unreadCount ?? 0;
    },
  });
}

/** Updates the authenticated user's profile and preferences. */
export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateProfileInput) => {
      const response = await apiClient.patch<ApiResponse<PublicUser>>('/users/me', payload);
      return response.data.data as PublicUser;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: socialQueryKeys.me });
    },
  });
}

/** Sends a new friend request. */
export function useSendFriendRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiClient.post<ApiResponse<FriendRequestDetail>>(`/friends/request/${userId}`);
      return response.data.data as FriendRequestDetail;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: socialQueryKeys.friendRequests }),
        queryClient.invalidateQueries({ queryKey: socialQueryKeys.search('') }),
        queryClient.invalidateQueries({ queryKey: ['users', 'search'] }),
        queryClient.invalidateQueries({ queryKey: socialQueryKeys.notificationsRoot }),
      ]);
    },
  });
}

/** Accepts a pending friend request. */
export function useAcceptFriendRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const response = await apiClient.post<ApiResponse<FriendshipDetail>>(`/friends/accept/${requestId}`);
      return response.data.data as FriendshipDetail;
    },
    onSuccess: async () => {
      await invalidateFriendQueries(queryClient);
    },
  });
}

/** Declines a pending friend request. */
export function useDeclineFriendRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const response = await apiClient.post<ApiResponse<FriendRequestDetail>>(`/friends/decline/${requestId}`);
      return response.data.data as FriendRequestDetail;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: socialQueryKeys.friendRequests });
    },
  });
}

/** Removes an existing friend. */
export function useRemoveFriendMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/friends/${userId}`);
    },
    onSuccess: async () => {
      await invalidateFriendQueries(queryClient);
    },
  });
}

/** Marks a single notification as read. */
export function useMarkNotificationReadMutation(page = 1, limit = 20) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await apiClient.patch<ApiResponse<Notification>>(`/notifications/${notificationId}/read`);
      return response.data.data as Notification;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: socialQueryKeys.notificationsRoot });
    },
  });
}

/** Marks all notifications as read. */
export function useMarkAllNotificationsReadMutation(page = 1, limit = 20) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.patch<ApiResponse<{ updatedCount: number }>>('/notifications/read-all');
      return response.data.data as { updatedCount: number };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: socialQueryKeys.notificationsRoot });
    },
  });
}

async function invalidateFriendQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.friends }),
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.friendRequests }),
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.friendFeed }),
    queryClient.invalidateQueries({ queryKey: ['users', 'search'] }),
  ]);
}