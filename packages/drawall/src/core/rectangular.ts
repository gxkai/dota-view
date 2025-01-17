import { RefK, Refs, RefView, RoRef } from "@/core/util";
import { Component, ComponentFactories, Entity, EntityComponentSystem, SOLO, Solo } from "@/core/ecs";
import { BLUE, Form } from "@/core/ux";
import {
  Angle,
  Circle,
  Distance,
  Distances,
  Polygon, Position,
  Positions,
  SDF,
  SpaceRay,
  Surface,
  Vector,
  Vectors
} from "@/core/spaces";
import { Icons } from "@/core/icons";
import { JsonObject, MoreJson, SavedComponent } from "@/core/io/json";
import { Furniture } from "@/core/furniture";
import { unwrap } from "@/core/lib/minewt";
import { Handle, HandleProps, Lever } from "@/core/handles";
import { ToolName } from "@/core/tools";
import { getResizeCursor } from "@/core/cursors";
import { Axis, Radians } from "@/core/linalg";
import { AutoForm } from "@/core/controls";
import { Amount } from "@/core/units";
import { DragItem } from "@/core/dragging";
import { Imaged } from "@/core/imaged";
import { MemoEdge } from "@/core/kinematics";
import { App } from "@/core/app";

/** resizeable and draggable rectangles */
export class Rectangular extends Component implements Surface, Solo {
  public readonly [SOLO] = true;

  private static posEq = (one: Position, two: Position): boolean => {
    if (one.space !== two.space) return false;
    const a = one.get(one.space);
    const b = two.get(two.space);
    return Math.abs(a.x - b.x) < 0.01
      && Math.abs(a.y - b.y) < 0.01;
  };

  private static distEq = (one: Distance, two: Distance) => {
    if (one.space !== two.space) return false;
    const a = one.get(one.space);
    const b = two.get(two.space);
    return Math.abs(a - b) < 0.01;
  };

  private static angleEq = (one: Angle, two: Angle) => {
    if (one.space !== two.space) return false;
    const a = unwrap(one.get('model'));
    const b = unwrap(two.get('model'));
    return Math.abs(a - b) < 0.001;
  };

  public readonly centerRef = Refs.of(Positions.zero('model'), Rectangular.posEq);
  public readonly widthRef = Refs.of(Distances.zero('model'), Rectangular.distEq);
  public readonly heightRef = Refs.of(Distances.zero('model'), Rectangular.distEq);
  public readonly rotationRef = Refs.of(Angle(Radians(0), 'model'), Rectangular.angleEq);
  public readonly keepAspectRef: Ref<boolean> = Refs.of(false);

  public readonly allowResizeH = Refs.of<boolean>(true);
  public readonly allowResizeV = Refs.of<boolean>(true);
  public readonly allowRotate = Refs.of<boolean>(true);

  // unit axes
  public readonly horizontalAxisRef: RoRef<Vector>;
  public readonly verticalAxisRef: RoRef<Vector>;

  public readonly dragItem: RoRef<DragItem>;

  // vectors from left to right and top to bottom
  private readonly horizontal: RoRef<Vector>;
  private readonly vertical: RoRef<Vector>;
  // horizontal & vertical extents from center
  private readonly leftSpan: RoRef<Vector>;
  private readonly rightSpan: RoRef<Vector>;
  private readonly upSpan: RoRef<Vector>;
  private readonly downSpan: RoRef<Vector>;
  // edge centers
  private readonly topRef: RoRef<Position>;
  private readonly leftRef: RoRef<Position>;
  private readonly rightRef: RoRef<Position>;
  private readonly bottomRef: RoRef<Position>;
  // corners
  private readonly topLeftRef: RoRef<Position>;
  private readonly topRightRef: RoRef<Position>;
  private readonly bottomLeftRef: RoRef<Position>;
  private readonly bottomRightRef: RoRef<Position>;

  private readonly edgesRef: RoRef<MemoEdge[]>;
  private readonly polyRef: RoRef<Polygon>;

  private readonly aspect: Ref<number> = Refs.of(1);
  private createdHandle: boolean = false;

  constructor(entity: Entity) {
    super(entity);

    this.horizontal = Refs.memoReduce(
      (width: Distance, angle: Angle, _: boolean) =>
        Vector(Axis.X, 'screen').to('model').rotate(angle).unit().scale(width),
      this.widthRef, this.rotationRef, App.viewport.changedRef,
    );
    this.vertical = Refs.memoReduce(
      (height: Distance, angle: Angle, _: boolean) =>
        Vector(Axis.Y, 'screen').to('model').rotate(angle).unit().scale(height),
      this.heightRef, this.rotationRef, App.viewport.changedRef,
    );

    this.horizontalAxisRef = Refs.memo(this.horizontal, v => v.unit());
    this.verticalAxisRef = Refs.memo(this.vertical, v => v.unit());

    const spanCalc = (scale: number) => (extent: Vector): Vector => extent.scale(scale);

    // directional extents from centroid
    this.upSpan = Refs.memoReduce(spanCalc(-0.5), this.vertical);
    this.downSpan = Refs.memoReduce(spanCalc(0.5), this.vertical);
    this.leftSpan = Refs.memoReduce(spanCalc(-0.5), this.horizontal);
    this.rightSpan = Refs.memoReduce(spanCalc(0.5), this.horizontal);

    const aplusb = (a: Position, b: Vector) => a.plus(b);

    // edge midpoints
    this.topRef = Refs.memoReduce(aplusb, this.centerRef, this.upSpan);
    this.bottomRef = Refs.memoReduce(aplusb, this.centerRef, this.downSpan);
    this.leftRef = Refs.memoReduce(aplusb, this.centerRef, this.leftSpan);
    this.rightRef = Refs.memoReduce(aplusb, this.centerRef, this.rightSpan);

    // corners
    this.topLeftRef = Refs.memoReduce(aplusb, this.topRef, this.leftSpan);
    this.topRightRef = Refs.memoReduce(aplusb, this.topRef, this.rightSpan);
    this.bottomLeftRef = Refs.memoReduce(aplusb, this.bottomRef, this.leftSpan);
    this.bottomRightRef = Refs.memoReduce(aplusb, this.bottomRef, this.rightSpan);

    // dragging
    this.dragItem = Refs.memoReduce(
      (..._: readonly [Position, Distance, Distance]) => this.computeDragItem(),
      this.centerRef, this.widthRef, this.heightRef,
    );

    this.edgesRef = Refs.memoReduce(
      (...points: Position[]) => points.map((p, i) =>
        new MemoEdge(p, points[(i + 1) % points.length])
      ),
      this.topLeftRef, this.topRightRef, this.bottomRightRef, this.bottomLeftRef,
    );

    this.polyRef = Refs.memoReduce(
      (...points: Position[]) => new Polygon(points),
      this.topLeftRef, this.topRightRef, this.bottomRightRef, this.bottomLeftRef,
    );

    this.widthRef.onChange(width => {
      if (this.keepAspect) {
        const height = width.div(this.aspect.get());
        if (height.minus(this.height).abs().gt(Distance(0.1, 'model'))) {
          this.height = height;
        }
        return;
      }
      this.aspect.set(width.div(this.height));
    });

    this.heightRef.onChange(height => {
      if (this.keepAspect) {
        const width = height.scale(this.aspect.get());
        if (width.minus(this.width).abs().gt(Distance(0.1, 'model'))) {
          this.width = width;
        }
        return;
      }
      this.aspect.set(this.width.div(height));
    });

    this.centerRef.onChange(() => App.project.requestSave('rect center'));
    this.heightRef.onChange(() => App.project.requestSave('rect height'));
    this.rotationRef.onChange(() => App.project.requestSave('rect rotation'));
    this.widthRef.onChange(() => App.project.requestSave('rect width'));
    this.keepAspectRef.onChange(() => App.project.requestSave('rect aspect keeping'));
  }

  public get center(): Position {
    return this.centerRef.get();
  }

  public set center(pos: Position) {
    this.centerRef.set(pos.to('model'));
  }

  public get width(): Distance {
    return this.widthRef.get();
  }

  public set width(d: Distance) {
    const w = d.to('model');
    if (Number.isNaN(w.get('model'))) {
      return;
    }
    if (w.get('model') < 0.1) {
      this.widthRef.set(Distance(0.1, 'model'));
      return;
    }
    this.widthRef.set(d.to('model'));
  }

  public get height(): Distance {
    return this.heightRef.get();
  }

  public set height(d: Distance) {
    const h = d.to('model');
    if (Number.isNaN(h.get('model'))) {
      return;
    }
    if (h.get('model') < 0.1) {
      this.heightRef.set(Distance(0.1, 'model'));
      return;
    }
    this.heightRef.set(d.to('model'));
  }

  get top(): Position {
    return this.topRef.get();
  }

  get left(): Position {
    return this.leftRef.get();
  }

  get bottom(): Position {
    return this.bottomRef.get();
  }

  get right(): Position {
    return this.rightRef.get();
  }

  get upRad(): Vector {
    return this.upSpan.get();
  }

  get downRad(): Vector {
    return this.downSpan.get();
  }

  get leftRad(): Vector {
    return this.leftSpan.get();
  }

  get rightRad(): Vector {
    return this.rightSpan.get();
  }

  get horizontalAxis(): Vector {
    return this.horizontalAxisRef.get();
  }

  get verticalAxis(): Vector {
    return this.verticalAxisRef.get();
  }

  public setTop(position: Position) {
    this.center = this.center.plus(
      Vectors.between(this.topRef.get(), position).onAxis(this.upSpan.get())
    );
  }

  public setBottom(position: Position) {
    this.center = this.center.plus(
      Vectors.between(this.bottomRef.get(), position).onAxis(this.downSpan.get())
    );
  }

  public setLeft(position: Position) {
    this.center = this.center.plus(
      Vectors.between(this.leftRef.get(), position).onAxis(this.leftSpan.get())
    );
  }

  public setRight(position: Position) {
    this.center = this.center.plus(
      Vectors.between(this.rightRef.get(), position).onAxis(this.rightSpan.get())
    );
  }

  public get rotation(): Angle {
    return this.rotationRef.get();
  }

  public set rotation(angle: Angle) {
    this.rotationRef.set(angle);
  }

  public get keepAspect() {
    return this.keepAspectRef.get();
  }

  public set keepAspect(b: boolean) {
    this.keepAspectRef.set(b);
  }

  public get edges(): MemoEdge[] {
    return this.edgesRef.get();
  }

  public get polygon(): Polygon {
    return this.polyRef.get();
  }

  public createHandle(props: Partial<HandleProps>) {
    if (this.createdHandle) return;
    this.createdHandle = true;

    const main = this.entity.add(Handle, {
      getPos: () => this.center,
      distance: p => this.sdist(p),
      drag: () => this.dragItem.get(),
      clickable: true,
      draggable: true,
      hoverable: true,
      selectable: true,
      ...props,
    });

    const knobs = this.createResizeHandles(main.priority + 0.1);
    knobs.forEach(knob => main.addKnob(knob));

    this.createRotationLever(main);

    const compareAmount = (a: Amount, b: Amount) => a.unit === b.unit && a.value === b.value;

    this.entity.add(Form, () => {
      const form = new AutoForm();
      form.add({
        name: 'rect.aspect',
        tooltip: 'lock/unlock aspect ratio',
        kind: 'toggle',
        value: this.keepAspectRef,
        icons: {
          on: Icons.aspectLocked,
          off: Icons.aspectUnlocked,
        },
      });
      form.add({
        name: 'rect.width',
        label: 'length',
        kind: 'distance',
        value: this.widthRef,
        enabled: this.allowResizeH,
        min: Distance(0.1, 'model'),
      });
      form.add({
        name: 'rect.height',
        label: 'width',
        kind: 'distance',
        value: this.heightRef,
        enabled: this.allowResizeV,
        min: Distance(0.1, 'model'),
      });
      form.add({
        name: 'rect.angle',
        label: 'rotation',
        kind: 'angle',
        value: this.rotationRef,
        enabled: this.allowRotate,
      });
      return form;
    });

    return main;
  }

  public sdist(position: Position): Distance {
    if (this.contains(position)) return Distance(0, 'model');
    return this.edges
      .map(edge => edge.distanceFrom(position))
      .reduce((a, b) => a.min(b), Distance(Number.POSITIVE_INFINITY, 'model'));
  }

  public contains(position: Position) {
    const halfplanes: Array<readonly [RoRef<Position>, RoRef<Vector>]> = [
      [this.topRef, this.downSpan],
      [this.bottomRef, this.upSpan],
      [this.leftRef, this.rightSpan],
      [this.rightRef, this.leftSpan],
    ];
    return halfplanes.every(([origin, normal]) =>
      Vectors.between(origin.get(), position).dot(normal.get()).sign >= 0
    );
  }

  public containedBy(sdf: SDF) {
    return [this.topRef, this.bottomRef, this.leftRef, this.rightRef].every(pos =>
      sdf.contains(pos.get())
    );
  }

  public intersects(sdf: SDF) {
    if (this.containedBy(sdf)) return true;
    const edges: Array<readonly [RoRef<Position>, RoRef<Vector>]> = [
      [this.topLeftRef, this.horizontal],
      [this.bottomLeftRef, this.horizontal],
      [this.topLeftRef, this.vertical],
      [this.topRightRef, this.vertical],
    ];
    for (const [corner, extent] of edges) {
      const hit = sdf.raycast(new SpaceRay(corner.get(), extent.get()));
      if (hit !== null && hit.time >= 0 && hit.time <= 1) {
        return true;
      }
    }
    return false;
  }

  private createRotationLever(main: Handle) {
    const calcPosition = (origin: Position, rotation: Angle) => (
      origin.plus(Vector(Axis.X, 'screen')
        .scale(this.width.scale(0.5).plus(Distance(50, 'screen')))
        .rotate(rotation))
    );
    const position = Refs.reduce({
      to: ([origin, rotation]) => calcPosition(origin, rotation),
      from: (position: Position) => [
        this.center,
        Vectors.between(this.center, position).angle()
      ],
      compareValues: Rectangular.posEq,
    }, this.centerRef, this.rotationRef);

    main.entity.add(Lever, 
      main,
      Refs.ro(this.centerRef),
      position,
      `url('${Icons.rotate}') 8 8, pointer`,
      this.allowRotate,
    );
  }

  private createResizeHandles(priority: number): Handle[] {
    type Frame = { origin: Position, horizontal: Vector, vertical: Vector };

    const resize = (
      name: string,
      frame: RoRef<Frame>,
      priority: number,
    ): Handle => {
      const distanceFunc: RoRef<(p: Position) => Distance> = Refs.memoReduce(
        (frame, horizontal, vertical) => {
          const hasX = frame.horizontal.mag2().nonzero;
          const hasY = frame.vertical.mag2().nonzero;
          if (hasX && hasY) {
            const circle = new Circle(frame.origin, Distance(10, 'screen'));
            return (p: Position) => circle.sdist(p);
          }
          if (hasX) {
            // left or right edge
            const edge = new MemoEdge(
              frame.origin.splus(-0.5, vertical),
              frame.origin.splus(+0.5, vertical),
            );
            return (p: Position) => edge.distanceFrom(p);
          }
          if (hasY) {
            // top or bottom edge
            const edge = new MemoEdge(
              frame.origin.splus(-0.5, horizontal),
              frame.origin.splus(+0.5, horizontal),
            );
            return (p: Position) => edge.distanceFrom(p);
          }
          // we got passed in all zeroes, what gives
          return (p: Position) => Distance(Number.POSITIVE_INFINITY, 'model');
        },
        frame, this.horizontal, this.vertical,
      );
      return this.entity.ecs.createEntity().add(Handle, {
        priority: priority,
        getPos: () => frame.get().origin,
        distance: p => distanceFunc.get()(p),
        cursor: () => getResizeCursor(Vectors.between(this.center, frame.get().origin), true),
        clickable: false,
        selectable: false,
        hoverable: false,
        draggable: true,
        control: true,
        visible: () => {
          if (!this.allowResizeH.get() && frame.get().horizontal.mag2().sign > 0) return false;
          if (!this.allowResizeV.get() && frame.get().vertical.mag2().sign > 0) return false;
          return true;
        },
        drag: () => {
          return {
            kind: 'point',
            name,
            get: () => frame.get().origin,
            set: p => {
              const { origin, horizontal, vertical } = frame.get();
              let delta = Vectors.between(origin, p);
              const startWidth = this.width;
              const startHeight = this.height;

              if (this.keepAspect
                && horizontal.mag2().nonzero
                && vertical.mag2().nonzero) {
                const axis1 = this.vertical.get().plus(this.horizontal.get()).unit();
                const axis2 = this.vertical.get().plus(this.horizontal.get().neg()).unit();
                const hv = horizontal.plus(vertical);
                const axis = hv.dot(axis1).abs().ge(hv.dot(axis2).abs()) ? axis1 : axis2;
                delta = delta.onAxis(axis);

                const startWidth = this.width;
                const startHeight = this.height;
                this.width = this.width.plus(delta.dot(horizontal));
              } else {
                this.width = this.width.plus(delta.dot(horizontal));
                this.height = this.height.plus(delta.dot(vertical));
              }
              this.center = this.center
                .splus(this.width.minus(startWidth).scale(0.5), horizontal)
                .splus(this.height.minus(startHeight).scale(0.5), vertical)
              ;
            },
            disableWhenMultiple: true,
          };
        },
      });
    };

    const up = Refs.memo(this.upSpan, v => v.unit());
    const down = Refs.memo(this.downSpan, v => v.unit());
    const left = Refs.memo(this.leftSpan, v => v.unit());
    const right = Refs.memo(this.rightSpan, v => v.unit());
    const zero = Refs.ofRo(Vectors.zero('model'));

    const frameOf = (
      origin: RoRef<Position>,
      horizontal: RoRef<Vector>,
      vertical: RoRef<Vector>,
    ): RoRef<Frame> => Refs.memoReduce(
      (origin, horizontal, vertical) => ({
        origin, horizontal, vertical,
      }),
      origin, horizontal, vertical,
    );

    return [
      resize('top', frameOf(this.topRef, zero, up), priority),
      resize('bottom', frameOf(this.bottomRef, zero, down), priority),
      resize('left', frameOf(this.leftRef, left, zero), priority),
      resize('right', frameOf(this.rightRef, right, zero), priority),
      resize('top-left', frameOf(this.topLeftRef, left, up), priority + 0.1),
      resize('top-right', frameOf(this.topRightRef, right, up), priority + 0.1),
      resize('bottom-left', frameOf(this.bottomLeftRef, left, down), priority + 0.1),
      resize('bottom-right', frameOf(this.bottomRightRef, right, down), priority + 0.1),
    ];
  }

  private computeDragItem(): DragItem {
    const points: Array<{
      name: string,
      ref: RefView<Position, RefK>,
    }> = [
      { name: 'center', ref: this.centerRef },
      { name: 'top midpoint', ref: this.topRef },
      { name: 'bottom midpoint', ref: this.bottomRef },
      { name: 'left midpoint', ref: this.leftRef },
      { name: 'right midpoint', ref: this.rightRef },
      { name: 'top-left corner', ref: this.topLeftRef },
      { name: 'top-right corner', ref: this.topRightRef },
      { name: 'bottom-left corner', ref: this.bottomLeftRef },
      { name: 'bottom-right corner', ref: this.bottomRightRef },
    ];
    return {
      kind: 'group',
      name: 'rect',
      aggregate: 'all',
      items: points.map(({ name, ref }, i) => {
        const delta = () => Vectors.between(this.centerRef.get(), ref.get());
        return {
          kind: 'point',
          name,
          get: () => ref.get(),
          set: p => this.centerRef.set(p.minus(delta())),
          disableWhenMultiple: i > 0,
        };
      }),
    };
  }

  public override toJson(): SavedComponent {
    const handle = this.entity.maybe(Handle);
    return {
      factory: this.constructor.name,
      arguments: [{
        center: MoreJson.position.to(this.center),
        width: MoreJson.distance.to(this.width),
        height: MoreJson.distance.to(this.height),
        rotation: MoreJson.angle.to(this.rotation),
        keepAspect: this.keepAspect,
        createdHandle: this.createdHandle,
        handleProps: {
          clickable: handle?.clickable,
          draggable: handle?.draggable,
          hoverable: handle?.hoverable,
          selectable: handle?.selectable,
          priority: handle?.priority,
          tools: handle?.tools,
        } as JsonObject,
      }],
    };
  }
}

ComponentFactories.register(Rectangular, (
  entity: Entity,
  props: {
    center: JsonObject,
    width: JsonObject,
    height: JsonObject,
    rotation: JsonObject,
    keepAspect: boolean,
    createdHandle: boolean,
    handleProps: {
      clickable?: boolean,
      draggable?: boolean,
      hoverable?: boolean,
      selectable?: boolean,
      priority?: number,
      tools?: ToolName[],
    },
  },
) => {
  const rect = entity.getOrCreate(Rectangular);
  // don't try to keep aspect while we're loading dimensions
  rect.keepAspect = false; 
  rect.center = MoreJson.position.from(props.center);
  rect.width = MoreJson.distance.from(props.width);
  rect.height = MoreJson.distance.from(props.height);
  rect.rotation = MoreJson.angle.from(props.rotation);
  rect.keepAspect = props.keepAspect;
  // let other components set this up
  //if (props.createdHandle) {
  //  rect.createHandle(props.handleProps || {});
  //}
  return rect;
});

export const RectangularRenderer = (ecs: EntityComponentSystem) => {
  App.canvas.lineWidth = 1;
  App.canvas.setLineDash([2, 2]);
  App.ecs.getComponents(Rectangular).forEach(rect => {
    if (rect.entity.has(Furniture)) return;
    const active = rect.entity.maybe(Handle)?.isActive;
    const hasTexture = rect.entity.has(Imaged) || rect.entity.has(Furniture);
    if (hasTexture && !active) {
      return; // don't need to render if image is there
    }
    App.canvas.strokeStyle = active ? BLUE : 'gray';
    App.canvas.polygon(rect.polygon);
    App.canvas.stroke();
  });
  App.canvas.setLineDash([]);
};

