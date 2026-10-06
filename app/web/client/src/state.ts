import type {
  Account,
  CandidateMatch,
  CandidateProfile,
  CandidateSummary,
  Catalog,
  Competition,
  EmployerProfile,
  PublicVacancy,
  Skill,
  User,
  Vacancy,
} from './types.ts';

interface AppState {
  catalog: Catalog;
  vacancies: PublicVacancy[];
  candidates: CandidateSummary[];
  matches: CandidateMatch[];
  vacancyId: string | null;
  category: string;
  search: string;
  specialization: string;
  grade: string;
  fsp: string;
  candidateId: string;
  user: User | null;
  account: Account | null;
  ownedVacancies: Vacancy[];
  assessmentId: string | null;
}

export const state: AppState = {
  catalog: { skills: [], competitions: [] },
  vacancies: [],
  candidates: [],
  matches: [],
  vacancyId: null,
  category: 'Все',
  search: '',
  specialization: '',
  grade: '',
  fsp: '',
  candidateId: 'alina',
  user: null,
  account: null,
  ownedVacancies: [],
  assessmentId: null,
};

export const skillById = (id: string): Skill | undefined => state.catalog.skills.find((item) => item.id === id);
export const competitionById = (id: string): Competition | undefined =>
  state.catalog.competitions.find((item) => item.id === id);
export const vacancyById = (id: string | null): PublicVacancy | undefined =>
  state.vacancies.find((item) => item.id === id);

export function requireVacancy(id: string): PublicVacancy {
  const vacancy = vacancyById(id);
  if (!vacancy) throw new Error(`Vacancy not loaded: ${id}`);
  return vacancy;
}

export function selectedVacancyId(): string {
  if (!state.vacancyId) throw new Error('No vacancy selected');
  return state.vacancyId;
}

export const candidateProfile = (): CandidateProfile | null =>
  state.account?.role === 'candidate' ? state.account.profile : null;
export const employerProfile = (): EmployerProfile | null =>
  state.account?.role === 'employer' ? state.account.profile : null;
