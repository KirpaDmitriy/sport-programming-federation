import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TargetGradeBadge, VerifiedGradeBadge } from './ui';

describe('qualification badges', () => {
  it('never shows a confirmed grade without a verified one', () => {
    render(<VerifiedGradeBadge grade={null} />);
    expect(screen.getByText('Уровень ещё не подтверждён')).toBeTruthy();
    expect(screen.queryByText(/^(Джуниор|Мидл|Сеньор) подтверждён/)).toBeNull();
  });

  it('keeps the selected target separate from the verified grade', () => {
    render(
      <>
        <VerifiedGradeBadge grade="junior" />
        <TargetGradeBadge grade="middle" />
      </>,
    );
    expect(screen.getByText('Джуниор подтверждён')).toBeTruthy();
    expect(screen.getByText(/Цель: Мидл/)).toBeTruthy();
  });
});
