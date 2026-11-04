interface Edge {
  to: number;
  reverse: number;
  remaining: number;
  capacity: number;
}

/** Small integer-capacity network: overlapping payment requirements cannot double-spend resources. */
export class PaymentFlow {
  private readonly nodes: Edge[][] = [];

  /** Allocate one requirement/resource node. */
  addNode(): number {
    this.nodes.push([]);
    return this.nodes.length - 1;
  }

  /** Add a forward edge and its residual reverse edge. */
  connect(from: number, to: number, capacity: number): Edge {
    const forward = { to, reverse: this.nodes[to].length, remaining: capacity, capacity };
    const backward = { to: from, reverse: this.nodes[from].length, remaining: 0, capacity: 0 };
    this.nodes[from].push(forward);
    this.nodes[to].push(backward);
    return forward;
  }

  /** Push whole amounts along augmenting paths, without iterating once per counter. */
  pay(source: number, sink: number, total: number): boolean {
    let paid = 0;
    while (paid < total) {
      const path = this.findPath(source, sink);
      if (!path) return false;
      const amount = Math.min(total - paid, ...path.map((step) => step.edge.remaining));
      for (const { from, edge } of path) {
        edge.remaining -= amount;
        this.nodes[edge.to][edge.reverse].remaining += amount;
      }
      paid += amount;
    }
    return true;
  }

  private findPath(source: number, sink: number): { from: number; edge: Edge }[] | undefined {
    const parents = new Map<number, { from: number; edge: Edge }>();
    const queue = [source];
    const seen = new Set([source]);
    for (let index = 0; index < queue.length && !seen.has(sink); index++) {
      const from = queue[index];
      for (const edge of this.nodes[from]) {
        if (edge.remaining <= 0 || seen.has(edge.to)) continue;
        seen.add(edge.to);
        parents.set(edge.to, { from, edge });
        queue.push(edge.to);
      }
    }
    if (!seen.has(sink)) return;
    const result: { from: number; edge: Edge }[] = [];
    for (let node = sink; node !== source; ) {
      const step = parents.get(node)!;
      result.push(step);
      node = step.from;
    }
    return result;
  }
}
