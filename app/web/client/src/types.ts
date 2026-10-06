// Shapes of the FastAPI responses this page reads (app/web, app/application/service.py)
// and of the request bodies it sends (app/web/schemas.py).

export type Role = 'candidate' | 'employer';

export interface Skill {
  id: string;
  name: string;
  category: string;
  prerequisites: string[];
}

export interface Competition {
  id: string;
  name: string;
  discipline: string;
  source: string;
  participants: number;
  difficulty: number;
  official: boolean;
  skill_relevance: Record<string, number>;
  starts_on: string | null;
}

export interface Catalog {
  skills: Skill[];
  competitions: Competition[];
}

export interface Requirement {
  skill_id: string;
  level: number;
  criticality: number;
}

export interface EvidencePolicy {
  mode: string;
  competition_ids: string[];
}

export interface Vacancy {
  id: string;
  employer: string;
  title: string;
  grade: string;
  work_format: string;
  salary_from: number;
  salary_to: number;
  requirements: Requirement[];
  evidence_policy: EvidencePolicy;
  specialization: string;
  description: string;
  team_description: string;
}

export interface PublicVacancy extends Vacancy {
  accepts_applications: boolean;
}

export interface SkillAssessment {
  skill_id: string;
  level: number;
  confidence: number;
  evidence_ids: string[];
}

export interface Profile {
  candidate_id: string;
  skills: Record<string, SkillAssessment>;
  categories: string[];
  verified_level: string;
}

export interface Gap {
  skill_id: string;
  required_level: number;
  confirmed_level: number;
  deficit: number;
  criticality: number;
}

export interface Match {
  candidate_id: string;
  vacancy_id: string;
  score: number;
  coverage: number;
  critical_gaps: number;
  gaps: Gap[];
  profile: Profile;
}

export interface Candidate {
  id: string;
  name: string;
  city: string;
  work_format: string;
  desired_role: string;
  about: string;
  stack: string[];
}

interface Verification {
  tested_category: string | null;
  verified_grade: string | null;
  has_fsp_history: boolean;
}

export interface CandidateSummary extends Candidate, Verification {
  profile: Profile;
}

export interface CandidateMatch extends Candidate, Verification {
  match: Match;
}

export interface Evidence {
  id: string;
  candidate_id: string;
  competition_id: string;
  source: string;
  external_id: string;
  placement: number;
  participants: number;
  role: string;
  rank: string | null;
  competition: string;
  discipline: string;
  official: boolean;
}

export interface GraphNode {
  id: string;
  label: string;
  category: string;
  depth: number;
  level: number;
  confidence: number;
  confirmed_level: number;
  required_level: number | null;
  criticality: number | null;
  is_requirement: boolean;
  status: 'ready' | 'gap' | 'confirmed' | 'prerequisite_gap';
}

export interface SkillGraph {
  nodes: GraphNode[];
  edges: { from: string; to: string }[];
}

export interface Recommendation {
  competition_id: string;
  score: number;
  closes_skills: string[];
}

export interface CandidateDetail extends CandidateSummary {
  evidence: Evidence[];
  graph: SkillGraph;
}

/** Candidate detail requested with `vacancy_id`: the service then always adds the match and recommendations. */
export interface CandidateDetailForVacancy extends CandidateDetail {
  match: Match;
  recommendations: Recommendation[];
}

export interface GraphDraft {
  provider: 'yandexgpt' | 'offline_rules';
  requirements: (Requirement & { relevance: number; rationale: string })[];
  warnings: string[];
}

export interface User {
  id: string;
  email: string;
  role: Role;
  display_name: string;
  email_verified: boolean;
}

export interface Session {
  authenticated: boolean;
  user: User | null;
}

export interface LoginResult {
  user: User;
  expires_at: string;
}

export interface RegisterResult {
  user: User;
  verification_delivery: 'demo_outbox' | 'email';
  verification_code?: string;
}

export interface CandidateProfile {
  user_id: string;
  candidate_id: string;
  name: string;
  city: string;
  work_format: string;
  desired_role: string;
  about: string;
  stack: string[];
  industry: string;
  specialization: string;
  claimed_grade: string;
  verified_grade: string | null;
  grade_changed_at: string | null;
  fsp_id: string | null;
  contact_email: string;
  years_experience: number;
  roles: string[];
  soft_skills: string[];
  profile_visible: boolean;
  consent_processing: boolean;
  consent_publication: boolean;
  updated_at: string;
}

export interface EmployerProfile {
  user_id: string;
  company_name: string;
  description: string;
  industry: string;
  contact_method: string;
  updated_at: string;
}

export interface CandidateAccount {
  role: 'candidate';
  profile: CandidateProfile | null;
}

export interface EmployerAccount {
  role: 'employer';
  profile: EmployerProfile | null;
}

export type Account = CandidateAccount | EmployerAccount;

export interface SavedCandidateAccount extends CandidateAccount {
  profile: CandidateProfile;
}

export interface Invitation {
  id: number;
  employer_user_id: string;
  candidate_id: string;
  vacancy_id: string | null;
  company_name: string;
  position_title: string;
  salary_from: number;
  salary_to: number;
  description: string;
  contact_method: string;
  status: 'sent' | 'viewed' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface EmployerInvitation extends Invitation {
  candidate_name: string;
  candidate_contact: string | null;
}

interface Application {
  id: number;
  candidate_user_id: string;
  candidate_id: string;
  vacancy_id: string;
  message: string;
  status: 'submitted' | 'viewed' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface CandidateApplication extends Application {
  title: string;
  employer: string;
  salary_from: number;
  salary_to: number;
}

export interface EmployerApplication extends Application {
  title: string;
  candidate_name: string;
  candidate_contact: string;
}

export interface Created {
  id: number;
  status: string;
}

export interface AssessmentAttempt {
  id: string;
  specialization: string;
  target_grade: string;
  questions: { id: string; grade: string; family: string; skill_id: string; prompt: string; options: string[] }[];
  method: string;
}

export interface AssessmentResult {
  id: string;
  score: number;
  passed: boolean;
  outcome: string;
  target_grade: string;
  recommended_grade: string;
  category: string | null;
  skill_signals: Record<string, { level: number; confidence: number }>;
}

export interface FspConnection {
  authorize_url: string;
  expires_in: number;
}

export interface InvitationInput {
  candidate_id: string;
  vacancy_id: string | null;
  position_title: string;
  salary_from: number;
  salary_to: number;
  description: string;
  contact_method: string;
}

export interface VacancyInput {
  id: string;
  employer: string;
  title: string;
  grade: string;
  specialization: string;
  description: string;
  team_description: string;
  work_format: string;
  salary_from: number;
  salary_to: number;
  requirements: Requirement[];
  evidence_policy: EvidencePolicy;
}
