import { impossible } from "@/core/util";
import { Distance, Distances, Position, SpaceEdge, Vector } from "@/core/spaces";

export const Drags = {
  empty: (): DragEmpty => ({ kind: 'empty', name: '', }),
  closure: (
    type: 'minimal' | 'complete',
    ...roots: DragItem[]
  ): DragClosure => {
    const closure: DragClosure = {
      points: [],
      snaps: [],
    };

    const seenItems = new Set<DragItem>();
    const seenSnaps = new Set<DragSnap>();

    const frontier = [...roots];
    while (frontier.length > 0) {
      const item = frontier.pop()!;
      if (seenItems.has(item)) continue;
      seenItems.add(item);

      if (roots.length > 1 && item.disableWhenMultiple) {
        continue;
      }

      item.snaps?.forEach(s => {
        if (seenSnaps.has(s)) return;
        seenSnaps.add(s);
        closure.snaps.push(s);
      });

      if (item.kind === 'empty') {
        continue;
      }
      if (item.kind === 'point') {
        closure.points.push(item);
        continue;
      }
      if (item.kind === 'group') {
        for (const x of item.items) {
          if (roots.length > 1 && x.disableWhenMultiple) {
            continue;
          }
          frontier.push(x);
          if (type === 'minimal' && item.aggregate !== 'all') {
            break;
          }
        }
      }
    }
    return closure;
  },
  chooseSnap: (
    context: DragContext,
    filter: ((snap: DragSnap) => boolean) = ((_) => true),
  ): SnapResult | null => {
    const { drag, starts, closure } = context;
    const validCategories = new Set<SnapCategory>();
    const allCategories: SnapCategory[] = [
      'local', 'geometry', 'guide', 'global', 'grid',
    ];
    for (const point of closure.points) {
      if (typeof point.snapCategories === 'undefined') {
        allCategories.forEach(c => validCategories.add(c));
        break;
      }
      point.snapCategories.forEach(c => validCategories.add(c));
      if (validCategories.size === allCategories.length) {
        break;
      }
    }
    let best: SnapResult | null = null;
    let index = 0;
    for (const point of closure.points) {
      const pointDrag = new Drag(
        starts[index],
        starts[index].plus(drag.delta),
      );
      for (const snap of closure.snaps) {
        if (!filter(snap)) continue;
        if (!validCategories.has(snap.category)) continue;
        if (typeof snap.closeEnough !== 'undefined' && !snap.closeEnough(pointDrag)) {
          continue;
        }
        const snapped = pointDrag.snapped(snap);
        const distance = Distances.between(pointDrag.end, snapped.end);
        if (best === null || distance.lt(best.distance)) {
          best = {
            snap,
            item: closure.points[index],
            distance,
            snapped,
            original: pointDrag,
          };
        }
      }
      index++;
    }
    return best;
  },
};

export type DragItem = DragGroup | DragPoint | DragEmpty;
export type DragSnap = SnapAxis | SnapPoint | SnapVec | SnapFunc;
export type SnapCategory = 'local' | 'geometry' | 'guide' | 'global' | 'grid';

export interface DragContext {
  drag: Drag;
  starts: Position[];
  closure: DragClosure;
}

export interface DragClosure {
  points: DragPoint[];
  snaps: DragSnap[];
}

export interface DragBase<K extends string> {
  kind: K;
  name: string;
  snaps?: DragSnap[];
  disableWhenMultiple?: boolean;
}

export interface DragPoint extends DragBase<'point'> {
  get: () => Position;
  set: (p: Position) => void;
  snapCategories?: SnapCategory[];
}

export interface DragGroup extends DragBase<'group'> {
  aggregate: 'first' | 'all';
  items: DragItem[];
}

export interface DragEmpty extends DragBase<'empty'> {
}

export interface SnapBase<K extends string> {
  kind: K;
  category: SnapCategory;
  name: string;
  closeEnough?: (drag: Drag) => boolean;
}

export interface SnapAxis extends SnapBase<'axis'> {
  direction: Vector;
  origin?: Position;
}

export interface SnapPoint extends SnapBase<'point'> {
  func: (pos: Position) => Position;
}

export interface SnapVec extends SnapBase<'vector'> {
  func: (delta: Vector) => Vector;
}

export interface SnapFunc extends SnapBase<'func'> {
  func: (drag: Drag) => Position;
}

export interface SnapResult {
  snap: DragSnap;
  item: DragItem;
  snapped: Drag;
  original: Drag; 
  distance: Distance;
}

export class Drag {
  public readonly edge: SpaceEdge;

  constructor(
    public readonly start: Position,
    public readonly end: Position,
  ) {
    this.edge = new SpaceEdge(start, end);
  }

  get midpoint(): Position {
    return this.edge.midpoint;
  }

  get tangent(): Vector {
    return this.edge.tangent;
  }

  get normal(): Vector {
    return this.edge.normal;
  }

  get delta(): Vector {
    return this.edge.vector;
  }

  onAxis(direction: Vector): Drag {
    return new Drag(
      this.start,
      this.start.plus(this.delta.onAxis(direction)),
    );
  }

  onLine(origin: Position, direction: Vector): Drag {
    return new Drag(
      this.start,
      this.end.onLine(origin, direction),
    );
  }

  snapped(snap: DragSnap): Drag {
    if (snap.kind === 'point') {
      return new Drag(this.start, snap.func(this.end));
    }
    if (snap.kind === 'vector') {
      return new Drag(
        this.start,
        this.start.plus(snap.func(this.delta)),
      );
    }
    if (snap.kind === 'func') {
      return new Drag(this.start, snap.func(this));
    }
    if (snap.kind === 'axis') {
      if (typeof snap.origin === 'undefined') {
        return this.onAxis(snap.direction);
      }
      return this.onLine(snap.origin, snap.direction);
    }
    return impossible(snap);
  }

  applyTo(item: DragItem) {
    if (item.kind === 'empty') return;
    if (item.kind === 'group') {
      item.items.forEach(item => this.applyTo(item));
      return;
    }
    if (item.kind === 'point') {
      item.set(this.end);
      return;
    }
    return impossible(item);
  }
}

