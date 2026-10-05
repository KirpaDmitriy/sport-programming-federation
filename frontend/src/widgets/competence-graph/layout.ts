import type { Graph } from '@/entities/skill';

export const NODE_WIDTH = 140;
export const NODE_HEIGHT = 96;
const GAP_X = 20;
const GAP_Y = 64;

type Point = { x: number; y: number };

/**
 * Deterministic tiered layout: role → skills → evidence. Positions depend only on the node order the
 * server returns, so an unchanged refetch never moves anything. Distances carry no meaning.
 */
export function layoutGraph(graph: Graph): Map<string, Point> {
  const positions = new Map<string, Point>();
  const skills = graph.nodes.filter((node) => node.kind === 'skill');
  const evidenceBySkill = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const from = graph.nodes.find((node) => node.id === edge.from);
    if (from?.kind === 'evidence') evidenceBySkill.set(edge.to, [...(evidenceBySkill.get(edge.to) ?? []), from.id]);
  }
  const columns = skills.map((skill) => Math.max(1, evidenceBySkill.get(skill.id)?.length ?? 0));
  const totalColumns = columns.reduce((sum, value) => sum + value, 0);
  const width = totalColumns * NODE_WIDTH + Math.max(0, totalColumns - 1) * GAP_X;

  let cursor = 0;
  skills.forEach((skill, index) => {
    const span = columns[index] ?? 1;
    const spanWidth = span * NODE_WIDTH + (span - 1) * GAP_X;
    const left = cursor * (NODE_WIDTH + GAP_X);
    positions.set(skill.id, { x: left + (spanWidth - NODE_WIDTH) / 2, y: NODE_HEIGHT + GAP_Y });
    (evidenceBySkill.get(skill.id) ?? []).forEach((evidenceId, offset) => {
      positions.set(evidenceId, { x: left + offset * (NODE_WIDTH + GAP_X), y: 2 * (NODE_HEIGHT + GAP_Y) });
    });
    cursor += span;
  });
  for (const node of graph.nodes.filter((item) => item.kind === 'role')) {
    positions.set(node.id, { x: (width - NODE_WIDTH) / 2, y: 0 });
  }
  return positions;
}
