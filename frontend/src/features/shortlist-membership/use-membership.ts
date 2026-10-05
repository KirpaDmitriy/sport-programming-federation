import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useScope } from '@/entities/session';
import {
  addShortlistMember,
  removeShortlistMember,
  type Shortlist,
  shortlistKey,
  shortlistQuery,
  shortlistsKey,
} from '@/entities/shortlist';

type Toggle = { candidateId: string; alias: string; member: boolean };

/**
 * Membership is server-owned and independent of search results. Toggles update every view of the
 * shortlist immediately and roll back if the server rejects the change.
 */
export function useShortlistMembership(shortlistId: string | null) {
  const scope = useScope();
  const queryClient = useQueryClient();
  const key = shortlistKey(scope, shortlistId ?? 'none');
  const shortlist = useQuery({ ...shortlistQuery(scope, shortlistId ?? 'none'), enabled: Boolean(shortlistId) });

  const toggle = useMutation({
    mutationFn: ({ candidateId, member }: Toggle) => {
      if (!shortlistId) throw new Error('Подборка не выбрана');
      return member ? removeShortlistMember(shortlistId, candidateId) : addShortlistMember(shortlistId, candidateId);
    },
    onMutate: async ({ candidateId, alias, member }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Shortlist>(key);
      if (previous) {
        const members = member
          ? previous.members.filter((item) => item.candidateId !== candidateId)
          : [...previous.members, { candidateId, alias, available: true }];
        queryClient.setQueryData<Shortlist>(key, { ...previous, members, count: members.length });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (updated) => queryClient.setQueryData(key, updated),
    onSettled: () => queryClient.invalidateQueries({ queryKey: shortlistsKey(scope), exact: true }),
  });

  const isMember = (candidateId: string) =>
    shortlist.data?.members.some((item) => item.candidateId === candidateId) ?? false;
  return { shortlist, isMember, toggle };
}
