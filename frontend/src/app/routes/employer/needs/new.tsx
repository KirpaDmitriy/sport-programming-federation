import { createFileRoute } from '@tanstack/react-router';
import { EmployerNeedEditorPage } from '@/pages/employer-need-editor';

export const Route = createFileRoute('/employer/needs/new')({
  component: () => <EmployerNeedEditorPage />,
});
