import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';
import { assessmentsKey, startAssessment } from '@/entities/assessment';
import { profileKey } from '@/entities/profile';
import { useScope } from '@/entities/session';
import { type components, isApiError, newIdempotencyKey } from '@/shared/api';

type Target = components['schemas']['AssessmentStartInput'];

/** One idempotency key per intended start; network retries of the same target reuse it. */
export function useStartAssessment() {
  const scope = useScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pending = useRef<{ target: string; key: string } | null>(null);
  return useMutation({
    mutationFn: (target: Target) => {
      const fingerprint = `${target.specialization}:${target.grade}`;
      if (pending.current?.target !== fingerprint) pending.current = { target: fingerprint, key: newIdempotencyKey() };
      return startAssessment(target, pending.current.key);
    },
    onSuccess: async (assessment) => {
      pending.current = null;
      await queryClient.invalidateQueries({ queryKey: assessmentsKey(scope) });
      await queryClient.invalidateQueries({ queryKey: profileKey(scope) });
      await navigate({ to: '/candidate/assessments/$assessmentId/workspace', params: { assessmentId: assessment.id } });
    },
    onError: (error) => {
      // A rejected start is final for this key; the next attempt is a new command.
      if (isApiError(error)) pending.current = null;
      void queryClient.invalidateQueries({ queryKey: profileKey(scope) });
    },
  });
}
