import { useMutation, useQueryClient } from '@tanstack/react-query';
import { profileKey, refreshEstimate } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { useToast } from '@/shared/ui';

/** Recomputes the profile estimate from the connected sources and stores the updated profile. */
export function useRefreshEstimate() {
  const scope = useScope();
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: refreshEstimate,
    onSuccess: (profile) => {
      queryClient.setQueryData(profileKey(scope), profile);
      toast('Оценка обновлена');
    },
  });
}
