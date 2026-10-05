import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { logout } from './api';

/** Ends the server session and drops every cached private response before showing sign-in. */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: logout,
    onSettled: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      await navigate({ to: '/login' });
    },
  });
}
