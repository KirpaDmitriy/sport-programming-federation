import { createFileRoute } from '@tanstack/react-router';
import { profileQuery } from '@/entities/profile';
import { scopeOf, sessionQueryOptions } from '@/entities/session';
import { vacancyQuery } from '@/entities/vacancy';
import { CandidateVacancyPage } from '@/pages/candidate-vacancy';

export const Route = createFileRoute('/candidate/vacancies/$vacancyId')({
  loader: async ({ context: { queryClient }, params }) => {
    const scope = scopeOf(await queryClient.ensureQueryData(sessionQueryOptions()));
    await Promise.all([
      queryClient.ensureQueryData(vacancyQuery(scope, params.vacancyId)),
      queryClient.ensureQueryData(profileQuery(scope)),
    ]);
  },
  component: function VacancyRoute() {
    const { vacancyId } = Route.useParams();
    return <CandidateVacancyPage vacancyId={vacancyId} />;
  },
});
