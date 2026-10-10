import type { Graph } from '@/entities/skill';

export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 96;
const GAP_X = 24;
const GAP_Y = 56;
const STACK_GAP = 14;

type Point = { x: number; y: number };

/**
 * Deterministic tiered layout. Top row: the sources; below them the category; then the concepts
 * with each concept's technologies in a column. Skills without a concept (a need's requirements)
 * take a column of their own. Positions depend only on the server's order, so an unchanged
 * refetch never moves anything. Distances carry no meaning.
 */
export function layoutGraph(graph: Graph): Map<string, Point> {
  const positions = new Map<string, Point>();
  const kindOf = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const conceptOf = new Map<string, string>();
  for (const edge of graph.edges)
    if (kindOf.get(edge.from) === 'concept' && kindOf.get(edge.to) === 'skill') conceptOf.set(edge.to, edge.from);

  const columns: { head: string | null; items: string[] }[] = [];
  for (const node of graph.nodes) {
    if (node.kind === 'concept') columns.push({ head: node.id, items: [] });
    if ((node.kind === 'skill' || node.kind === 'evidence') && !conceptOf.has(node.id))
      columns.push({ head: null, items: [node.id] });
  }
  for (const [skill, concept] of conceptOf) columns.find((column) => column.head === concept)?.items.push(skill);
  const order = new Map(graph.nodes.map((node, index) => [node.id, index]));
  for (const column of columns) column.items.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  const step = NODE_WIDTH + GAP_X;
  const sources = graph.nodes.filter((node) => node.kind === 'source');
  const roles = graph.nodes.filter((node) => node.kind === 'role');
  const width = Math.max(columns.length, sources.length, roles.length, 1) * step - GAP_X;
  const row = (index: number) => index * (NODE_HEIGHT + GAP_Y);
  const centered = (count: number, index: number) => (width - (count * step - GAP_X)) / 2 + index * step;

  const roleRow = sources.length ? 1 : 0;
  sources.forEach((node, index) => {
    positions.set(node.id, { x: centered(sources.length, index), y: row(0) });
  });
  roles.forEach((node, index) => {
    positions.set(node.id, { x: centered(roles.length, index), y: row(roleRow) });
  });
  columns.forEach((column, index) => {
    const x = index * step;
    if (column.head) positions.set(column.head, { x, y: row(roleRow + 1) });
    const first = row(roleRow + (column.head ? 2 : 1));
    column.items.forEach((id, offset) => {
      positions.set(id, { x, y: first + offset * (NODE_HEIGHT + STACK_GAP) });
    });
  });
  return positions;
}
