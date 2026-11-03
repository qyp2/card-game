/**
 * Select a prerequisite component, ignoring only edges within a dependency cycle.
 *
 * Builds the dependency graph, runs Tarjan's strongly-connected-components
 * algorithm, then picks the lowest-indexed component whose members depend on
 * nothing outside itself. That component is safe to resolve next.
 */
export function nextEffectIndex<T>(ordered: T[], dependsOn: (effect: T, prerequisite: T) => boolean): number {
  // Adjacency list: edges[i] holds the indices that effect i depends on.
  const edges = ordered.map((effect, index) =>
    ordered.flatMap((other, j) => {
      if (index !== j && dependsOn(effect, other)) return [j];
      return [];
    }));

  // Tarjan bookkeeping: discovery index, low-link index, DFS stack, membership.
  const indices = new Map<number, number>(), low = new Map<number, number>();
  const stack: number[] = [], onStack = new Set<number>(), components: number[][] = [];
  let sequence = 0;

  /** Depth-first walk that emits one component each time a root is closed. */
  function visit(node: number) {
    indices.set(node, sequence);
    low.set(node, sequence++);
    stack.push(node);
    onStack.add(node);

    for (const other of edges[node]) {
      // Unvisited dependency: recurse, then propagate its low-link upward.
      if (!indices.has(other)) {
        visit(other);
        low.set(node, Math.min(low.get(node)!, low.get(other)!));
      } else if (onStack.has(other)) {
        // Back edge into the current DFS path: fold in its discovery index.
        low.set(node, Math.min(low.get(node)!, indices.get(other)!));
      }
    }

    // A node whose low-link equals its own index roots a component.
    if (low.get(node) === indices.get(node)) {
      const component: number[] = [];
      let member: number;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      components.push(component);
    }
  }

  ordered.forEach((_, i) => {
    if (!indices.has(i)) visit(i);
  });

  // Keep only components with no outgoing edges to other components.
  const eligible = components.filter((group) => {
    const members = new Set(group);
    return group.every((node) => edges[node].every((other) => members.has(other)));
  });

  return Math.min(...eligible.flat());
}
