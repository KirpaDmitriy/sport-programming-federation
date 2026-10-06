import { $ } from './dom.ts';
import { html, percent } from './format.ts';
import type { GraphNode, SkillGraph } from './types.ts';

const colors: Record<string, string> = {
  Backend: '#315cff',
  'AI / ML': '#9b7bff',
  'Системная разработка': '#ff654f',
  'Product Engineering': '#caff49',
  Кибербезопасность: '#ffb52e',
};

export function renderGraph(graph: SkillGraph): void {
  const svg = $('#skill-graph', SVGSVGElement);
  const width = 720;
  const height = 390;
  const maxDepth = Math.max(...graph.nodes.map((node) => node.depth || 0), 0);
  const columns = new Map<number, GraphNode[]>();
  for (const node of graph.nodes) {
    const depth = node.depth || 0;
    const column = columns.get(depth) ?? [];
    column.push(node);
    columns.set(depth, column);
  }
  const positions = new Map<string, { x: number; y: number }>();
  for (const [depth, nodes] of columns) {
    nodes.sort((left, right) => left.label.localeCompare(right.label, 'ru'));
    const x = maxDepth ? 72 + depth * ((width - 144) / maxDepth) : width / 2;
    const spacing = Math.min(106, (height - 74) / Math.max(nodes.length, 1));
    const startY = height / 2 - (spacing * (nodes.length - 1)) / 2;
    for (const [index, node] of nodes.entries()) positions.set(node.id, { x, y: startY + index * spacing });
  }
  const edges = graph.edges
    .map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return '';
      const middle = (from.x + to.x) / 2;
      return `<path class="graph-edge" d="M ${from.x + 43} ${from.y} C ${middle} ${from.y}, ${middle} ${to.y}, ${to.x - 49} ${to.y}" marker-end="url(#graph-arrow)"/>`;
    })
    .join('');
  const nodes = graph.nodes
    .map((node) => {
      const point = positions.get(node.id);
      if (!point) return '';
      const radius = 45;
      const missing = node.status === 'gap' || node.status === 'prerequisite_gap';
      const color = missing ? '#292930' : colors[node.category] || '#315cff';
      const lines = node.label.split(' ').reduce<string[]>((result, word) => {
        const current = result.at(-1);
        if (!current || (current.length + word.length + 1 > 15 && result.length < 2)) result.push(word);
        else result[result.length - 1] = `${current} ${word}`;
        return result;
      }, []);
      const second = lines[1];
      if (second && second.length > 15) lines[1] = `${second.slice(0, 14)}…`;
      const fontSize = node.label.length > 24 ? 10 : 11;
      const labelY = lines.length === 1 ? -4 : -11;
      const label = lines.map((line, index) => `<tspan x="0" dy="${index ? 13 : 0}">${html(line)}</tspan>`).join('');
      const scoreY = lines.length === 1 ? 15 : 21;
      const lightNode = !missing && (node.category === 'Product Engineering' || node.category === 'Кибербезопасность');
      const score = node.is_requirement
        ? `${percent(node.confirmed_level)} / ${percent(node.required_level ?? 0)}`
        : node.status === 'confirmed'
          ? `${percent(node.confirmed_level)} подтверждено`
          : 'нужен пререквизит';
      return `<g class="graph-node graph-${node.status}${lightNode ? ' graph-node-light' : ''}" transform="translate(${point.x} ${point.y})"><circle r="${radius}" fill="${color}"/><text class="graph-label" y="${labelY}" style="font-size:${fontSize}px">${label}</text><text class="graph-score" y="${scoreY}">${score}</text>${node.is_requirement ? '<text class="graph-target" y="-53">цель</text>' : ''}</g>`;
    })
    .join('');
  svg.innerHTML = `<defs><marker id="graph-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>${edges}${nodes}`;
}
