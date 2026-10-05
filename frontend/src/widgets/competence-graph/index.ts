import { lazy } from 'react';

// The renderer and its stylesheet load only on screens that show a graph.
export const CompetenceGraph = lazy(() => import('./competence-graph'));
export type { CompetenceGraphProps } from './competence-graph';
