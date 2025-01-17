import { Component, Entity } from "@/core/ecs";
import { UiDragEvent, UiEventDispatcher, UiKeyEvent, UiMouseEvent } from "@/core/uievents";
import { Wall, WallJoint } from "@/core/model";
import { Counter, DefaultMap, impossible, Kinds, Ref, Refs } from "@/core/util";
import { Grid } from "@/core/canvas";
import { Furniture } from "@/core/furniture";
import { Distance, Distances, Position, SpaceEdge, Spaces, Vector, Vectors } from "@/core/spaces";
import { Cursor } from "@/core/cursors";
import { unwrap } from "@/core/lib/minewt";
import { Drag, DragClosure, Drags, DragSnap, SnapResult } from "@/core/dragging";
import { ToolName } from "@/core/tools";
import { Dragging, Handle, Hovered, Lever, Selected } from "@/core/handles";
import { Popup } from "@/core/popups";
import { Axis, Degrees, Point, toDegrees, Vec } from "@/core/linalg";
import { AutoForm } from "@/core/controls";
import { App } from "@/core/app";

export const PINK = '#F5A9B8';
export const BLUE = '#5BCEFA';

export class Form extends Component {
  private readonly factories: Array<() => AutoForm> = [];

  constructor(
    entity: Entity,
    factory?: () => AutoForm,
  ) {
    super(entity);
    if (typeof factory !== 'undefined') {
      this.factories.push(factory);
    }
  }

  add(f: () => AutoForm) {
    this.factories.push(f);
  }

  public get form(): AutoForm {
    return AutoForm.union(this.factories.map(f => f()));
  }
}

export interface MouseState {
  position: Position;
  buttons: number;
  pressed: boolean;
  dragging: boolean;
  start: Position;
  distanceDragged: Distance; 
}

export class SnapState {
  public readonly enableByDefaultRef: Ref<boolean> = Refs.of(false);
  public readonly enabledRef: Ref<boolean> = Refs.of(false);
  public readonly snapToLocalRef: Ref<boolean> = Refs.of(false);
  public readonly snapToGlobalRef: Ref<boolean> = Refs.of(false);
  public readonly snapToGeometryRef: Ref<boolean> = Refs.of(false);
  public readonly snapRadius: Ref<Distance> = Refs.of(Distance(25, 'screen'));
  public readonly angleThreshold: Ref<Degrees> = Refs.of(
    Degrees(10), (a, b) => unwrap(a) === unwrap(b)
  );

  public get enabled(): boolean {
    return this.enableByDefaultRef.get();
  }

  public set enabled(v: boolean) {
    this.enableByDefaultRef.set(v);
  }

  public get snapToLocal(): boolean {
    return this.snapToLocalRef.get();
  }

  public set snapToLocal(v: boolean) {
    this.snapToLocalRef.set(v);
  }

  public get snapToGlobal(): boolean {
    return this.snapToGlobalRef.get();
  }

  public set snapToGlobal(v: boolean) {
    this.snapToGlobalRef.set(v);
  }

  public get snapToGeometry(): boolean {
    return this.snapToGeometryRef.get();
  }

  public set snapToGeometry(v: boolean) {
    this.snapToGeometryRef.set(v);
  }
}

export class UiState {
  public readonly events = new UiEventDispatcher(UiState);
  public grabRadius: Distance = Distance(10, 'screen');

  private readonly mouse: MouseState = {
    position: Position(Point.ZERO, 'screen'),
    buttons: 0,
    pressed: false,
    dragging: false,
    start: Position(Point.ZERO, 'screen'),
    distanceDragged: Distance(0, 'screen'),
  };

  private keysPressed = new DefaultMap<string, boolean>(() => false);
  private swappedTool: ToolName | null = null;
  private currentSnapResult: SnapResult | null = null;
  private preferredSnap: string | null = null;
  public readonly snapping = new SnapState();

  update() {
    App.tools.current.update();

    if (this.dragging) {
      this.renderSnap();
    }

    if (this.selection.size === 1) {
      for (const s of this.selection) {
        for (const lever of s.entity.get(Lever)) {
          if (lever.visible) {
            this.renderLever(lever);
          }
        }
      }
    }
  }

  isKeyPressed(key: string): boolean {
    return this.keysPressed.get(key);
  }

  get pressedKeys(): string[] {
    // little does the map api know that its
    // keys are literal keys this time!!! >:D
    return Array.from(this.keysPressed.keys())
      .filter(key => this.keysPressed.get(key));
  }

  get multiSelecting(): boolean {
    return this.keysPressed.get('Shift');
  }

  get mousePos(): Position {
    return this.mouse.position;
  }

  get dragging(): boolean {
    return this.mouse.dragging;
  }

  cancelDrag() {
    if (this.mouse.dragging) {
      const base = {
        start: this.mouse.start,
        position: this.mouse.start,
        delta: Vector(Vec.ZERO, 'screen'),
        primary: true,
      };
      this.events.handleDrag({ kind: 'update', ...base });
      this.events.handleDrag({ kind: 'end', ...base });
    }
    this.mouse.dragging = false;
    this.mouse.pressed = false;
    this.clearDragging();
  }

  get selection(): Set<Handle> {
    return new Set(
      App.ecs.getComponents(Selected)
        .map(s => s.entity)
        .filter(s => s.has(Handle))
        .map(s => s.only(Handle))
    ); 
  }

  clearSelection() {
    App.ecs.getComponents(Selected).map(s => s.entity.only(Handle)).forEach(e => {
      e.selected = false;
      e.hovered = false;
      e.dragging = false;
    });
    this.updateForms();
  }

  clearDragging() {
    App.ecs.getComponents(Dragging).map(s => s.entity.only(Handle)).forEach(e => {
      e.dragging = false;
    });
  }

  setSelection(...handles: Handle[]) {
    const current = this.selection;
    const updated = new Set(handles);
    for (const h of current) {
      if (!updated.has(h)) {
        h.selected = false;
      }
    }
    for (const h of updated) {
      h.selected = true;
    }
    this.updateForms();
  }

  addSelection(...handles: Handle[]) {
    handles.forEach(h => { 
      h.selected = true;
    });
    this.updateForms();
  }

  select(...handles: Handle[]) {
    if (handles.every(h => h.isSelected)) return;
    if (this.multiSelecting) {
      this.addSelection(...handles);
    } else {
      this.setSelection(...handles);
    }
  }

  loopSelect() {
    const collected = new Set<Handle>();
    const frontier = [...this.selection];
    while (frontier.length > 0) {
      const handle = frontier.pop()!;
      if (collected.has(handle)) {
        continue;
      }
      collected.add(handle);
      if (handle.entity.has(Wall)) {
        handle.entity.only(Wall).getConnectedLoop()
          .map(wall => wall.entity.only(Handle))
          .forEach(h => collected.add(h));
      } else if (handle.entity.has(WallJoint)) {
        const dst = handle.entity.only(WallJoint).outgoing?.entity?.only(Handle);
        if (dst) frontier.push(dst);
      }
    }
    this.setSelection(...Array.from(collected).filter(h => h.selectable));
  }

  selectAll() {
    this.setSelection(...App.ecs.getComponents(Handle)
      .filter(h => h.selectable && h.visible && !h.control && h.isForTool(App.tools.current.name)));
  }

  deleteSelected() {
    const selected = this.selection;
    if (selected.size === 0) {
      return;
    }
    this.cancelDrag();
    this.clearSelection();
    selected.forEach(s => s.delete());
    App.project.requestSave('selection deleted');
  }

  clearHovered() {
    App.ecs.getComponents(Hovered).forEach(h => h.unhover());
  }

  flip(axis: 'horizontal' | 'vertical') {
    for (const handle of this.selection) {
      handle.entity.maybe(Furniture)?.flip(axis);
    }
  }

  getDragClosure(
    type: 'minimal' | 'complete' = 'minimal',
    selection: Handle[],
  ): DragClosure {
    const closure = Drags.closure(type, ...selection.map(s => s.getDragItem()));
    if (this.multiSelecting) {
      closure.points = closure.points.filter(p => !p.disableWhenMultiple);
    }
    closure.snaps.push({
      kind: 'point',
      category: 'grid',
      name: 'grid',
      func: pos => Grid.getGrid().snap(pos),
      closeEnough: drag => {
        const grid = Grid.getGrid();
        const delta = Distances.between(grid.snap(drag.end), drag.end);
        return delta.le(grid.spacing.scale(0.5));
      },
    });
    const theta = unwrap(this.snapping.angleThreshold.get());
    closure.snaps.push({
      kind: 'axis',
      category: 'global',
      name: 'X-Axis',
      direction: Vector(Axis.X, 'screen'),
      closeEnough: drag => {
        const angle = Math.abs(unwrap(toDegrees(drag.tangent.angle().get('screen'))));
        return Math.abs(angle) < theta || Math.abs(angle - 180) < theta;
      },
    });
    closure.snaps.push({
      kind: 'axis',
      category: 'global',
      name: 'Y-Axis',
      direction: Vector(Axis.Y, 'screen'),
      closeEnough: drag => {
        const angle = Math.abs(unwrap(toDegrees(drag.tangent.angle().get('screen'))));
        return Math.abs(angle - 90) < theta || Math.abs(angle - 270) < theta;
      },
    });
    return closure;
  }

  isSnapEnabled(snap: DragSnap): boolean {
    if (!this.snapping.enabled) {
      return false;
    }
    if (snap.category === 'grid') {
      return App.settings.snapGrid.get();
    }
    if (snap.category === 'local') {
      return this.snapping.snapToLocalRef.get();
    }
    if (snap.category === 'guide') {
      return this.snapping.snapToGeometryRef.get();
    }
    if (snap.category === 'geometry') {
      return this.snapping.snapToGeometryRef.get();
    }
    if (snap.category === 'global') {
      return this.snapping.snapToGlobalRef.get();
    }
    return impossible(snap.category);
  }

  initiateDrag() {
    const event: UiDragEvent = {
      kind: 'start',
      primary: true,
      start: this.mousePos,
      position: this.mousePos,
      delta: Vectors.zero('screen'),
    };
    this.mouse.pressed = true;
    this.mouse.dragging = true;
    this.mouse.start = this.mousePos;
    this.mouse.distanceDragged = Distance(0, 'screen');
    App.tools.current.events.handleDrag(event);
  }

  getDefaultDragHandler(filter: (handle: Handle) => boolean): UiEventDispatcher {
    const dispatcher = new UiEventDispatcher(UiState, 'default drag handler');
    const pickCursor = (handle: Handle[]): Cursor => {
      const counter = new Counter<Cursor>();
      let max = 0;
      for (const h of handle) {
        max = Math.max(max, counter.inc(h.getContextualCursor()));
      }
      if (max === 0) return 'grabbing';
      return Array.from(counter.keys()).filter(k => counter.get(k) === max)[0]!;
    };
    dispatcher.addDragListener({
      onStart: e => {
        const hovering = this.getHandleAt(e.start, filter);
        const selection: Array<Handle> = [];

        if (hovering !== null) {
          selection.push(hovering);

          if (hovering.selectable) {
            const seen = new Set<Handle>(selection);
            const collect = (h: Handle) => {
              if (seen.has(h)) return;
              seen.add(h);
              selection.push(h);
            };
            this.selection.forEach(collect);
          }
        } else {
          this.selection.forEach(s => selection.push(s));
        }

        App.pane.style.cursor = pickCursor(selection);
        selection.forEach(h => { h.dragging = true; });
        selection.forEach(h => h.events.handleDrag(e));

        const closure = this.getDragClosure('minimal', selection);
        const starts = closure.points.map(point => point.get());
        return { closure, starts, selection };
      },
      onUpdate: (e, { closure, starts, selection }) => {
        if (App.ecs.getComponents(Dragging).length === 0) return;
        const drag = new Drag(e.start, e.position);
        const preferred = this.preferredSnap !== null
          ? closure.snaps.filter(s => s.name === this.preferredSnap)[0]
          : undefined;
        const result = preferred ? {
          snap: preferred,
          item: closure.points[0],
          snapped: drag.snapped(preferred),
          original: drag,
          distance: Distances.between(drag.snapped(preferred).end, drag.end),
        } : Drags.chooseSnap(
          { drag, starts, closure },
          snap => this.isSnapEnabled(snap),
        );
        this.currentSnapResult = result;
        const delta = (result?.snapped || drag).delta;
        closure.points.forEach((point, i) => point.set(starts[i].plus(delta)));
        selection.forEach(h => h.events.handleDrag(e));
      },
      onEnd: (e, { selection }) => {
        selection.forEach(h => h.events.handleDrag(e));
        const selectable = selection.filter(s => s.selectable && !s.control);
        if (selectable.length > 0) {
          this.setSelection(...selectable);
        }
        this.clearDragging();
        this.currentSnapResult = null;
        this.preferredSnap = null;
        App.project.requestSave('drag completed');
      },
    });
    return dispatcher;
  }

  get defaultDragHandler(): UiEventDispatcher {
    return this.getDefaultDragHandler(h => h.draggable);
  }

  public renderKnob(handle: Handle) {
    const knob = handle.knob;
    if (knob === null) {
      return;
    }
    const poly = knob.poly();
    App.canvas.polygon(poly);
    
    if (typeof knob.fill !== 'undefined') {
      App.canvas.fillStyle = knob.fill;
      App.canvas.fill();
    }
    if (typeof knob.stroke !== 'undefined') {
      App.canvas.lineWidth = 1;
      App.canvas.strokeStyle = knob.stroke;
      App.canvas.stroke();
    }
  }

  public renderLever(lever: Lever) {
    App.canvas.lineWidth = 1;
    App.canvas.setLineDash([]);
    App.canvas.strokeStyle = BLUE;

    const src = lever.origin.get();
    const dst = lever.position.get();
    const tangent = lever.tangent;

    const srcRad = Distance(2, 'screen');
    const dstRad = Distance(5, 'screen');
    const margin = Distance(1, 'screen');

    App.canvas.strokeCircle(src, srcRad);

    App.canvas.strokeLine(
      src.splus(srcRad.plus(margin), tangent),
      dst.splus(dstRad.plus(margin), tangent.neg()),
    );

    App.canvas.lineWidth = 2;
    App.canvas.strokeCircle(dst, dstRad);

    App.canvas.lineWidth = 1;
    App.canvas.setLineDash([]);
  }

  renderSnap() {
    const result = this.currentSnapResult;
    if (result === null) return;
    const color = this.getSnapColor(result.snap);
    
    if (result.snap.kind === 'axis' || result.snap.kind === 'vector') {
      const screenSize = Distance(Math.max(
        App.viewport.screen_width,
        App.viewport.screen_height,
      ), 'screen');
      const axis = new SpaceEdge(
        result.snapped.end.splus(screenSize, result.snapped.delta.neg()),
        result.snapped.end.splus(screenSize, result.snapped.delta),
      );
      App.canvas.strokeStyle = color;
      App.canvas.strokeLine(axis.src, axis.dst);
      App.canvas.text({
        text: `${result.item.name} to ${result.snap.name}`,
        fill: color,
        point: axis.midpoint.splus(
          Distance(App.settings.fontSize, 'screen'),
          axis.normal,
        ),
        axis: axis.tangent,
        keepUpright: true,
        align: 'center',
        baseline: 'bottom',
      });
    } else {
      App.canvas.arrow(result.original.end, result.snapped.end);
      App.canvas.fillStyle = color;
      App.canvas.fill();
      App.canvas.text({
        text: `${result.item.name} to ${result.snap.name}`,
        point: result.snapped.end.splus(
          Distance(20, 'screen'),
          Vector(Axis.X, 'screen'),
        ),
        keepUpright: true,
        align: 'left',
        baseline: 'middle',
        fill: color,
      });
    }
  }

  setHovered(...handles: Handle[]) {
    const set = new Set(handles);
    handles.forEach(h => { h.hovered = true; });
    App.ecs.getComponents(Hovered)
      .map(h => h.entity.only(Handle))
      .forEach(h => { h.hovered = set.has(h); });
  }

  getHandleAt(
    position: Position,
    filter?: (h: Handle) => boolean,
    includeOtherTools?: boolean,
  ): Handle | null {
    const radius = this.grabRadius;
    const handles = App.ecs.getComponents(Handle);
    // sort descending
    handles.sort((a, b) => b.priority - a.priority);

    let choice: Handle | null = null;
    let choiceDistance = 0;
    for (const handle of handles) {
      if (!handle.visible) {
        continue;
      }
      if (!includeOtherTools && !handle.isForTool(App.tools.current.name)) {
        continue;
      }
      if (typeof filter !== 'undefined' && !filter(handle)) {
        continue;
      }
      if (this.multiSelecting && handle.getDragClosure('complete').points
        .every(p => p.disableWhenMultiple)) {
        continue;
      }
      if (choice !== null && choice.priority > handle.priority) {
        // the handles are sorted by descending priority, so we
        // can exit early here. 
        return choice;
      }
      const handleDistance = handle.distanceFrom(position).get('screen');
      if (handleDistance > radius.get('screen')) {
        continue;
      }
      if (choice === null || handleDistance < choiceDistance) {
        choice = handle;
        choiceDistance = handleDistance;
      }
    }
    return choice;
  }

  public snapPoint(pos: Position) {
    // TODO: should prob plug into formalized snapping system
    if (this.snapping.enabled && App.settings.snapGrid.get()) {
      return Grid.getGrid().snap(pos);
    }
    return pos;
  }

  public updateForms() {
    const forms = Array.from(this.selection)
      .map(handle => handle.entity.get(Form))
      .map(forms => AutoForm.union(forms.map(form => form.form)));
    const form = AutoForm.union(forms);
    App.gui.selection.clear();
    form.inflate(App.gui.selection);
  }

  private getSnapColor(snap: DragSnap): string {
    if (snap.name === 'X-Axis') return BLUE;
    if (snap.name === 'Y-Axis') return PINK;
    if (snap.name === 'grid') return 'gray';
    return 'orange';
  }

  setup() {
    this.events.forward({
      handleDrag: e => App.tools.current.events.handleDrag(e),
      handleKey: e => App.tools.current.events.handleKey(e),
      handleMouse: e => App.tools.current.events.handleMouse(e),
    });

    this.events.onKey('keydown', e => {
      if (this.keysPressed.get(e.key)) {
        return;
      }

      this.keysPressed.set(e.key, true);
      if (this.dragging) {
        if (e.key === 'Control') {
          this.snapping.enabled = !this.snapping.enabled;
          if (!this.snapping.enabled) {
            this.preferredSnap = null;
          }
        } else if (e.key === 'x') {
          this.preferredSnap = 'X-Axis';
        } else if (e.key === 'y') {
          this.preferredSnap = 'Y-Axis';
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        this.deleteSelected();
      }

      if (e.key === 'Alt') {
        if (App.tools.current.name !== 'pan tool') {
          App.tools.pushTool();
          App.tools.set('pan tool');
          this.initiateDrag();
        }
        e.preventDefault();
        return;
      }

      if (App.actions.evaluateKeybindings()) {
        e.preventDefault();
      }
    });

    this.events.onKey('keyup', e => {
      this.keysPressed.delete(e.key);
      if (e.key === 'Alt') {
        if (App.tools.popTool()) {
          e.preventDefault();
        }
      }
    });

    window.addEventListener('focus', () => {
      this.keysPressed.clear();
      this.cancelDrag();
    });

    const makeKeyEvent = (kind: Kinds<UiKeyEvent>, e: KeyboardEvent): UiKeyEvent => ({
        kind,
        key: e.key,
        which: e.which,
        preventDefault: () => e.preventDefault(),
    });

    // mouse event util
    const isPrimary = (buttons: number) => {
      return typeof buttons === 'undefined' || buttons === 1;
    };

    const getMousePosition = (e: MouseEvent) => {
      const rect = App.pane.getBoundingClientRect();
      return Position(new Point(
        e.clientX - rect.left,
        e.clientY - rect.top,
      ), 'screen');
    };

    const makeMouseEvent = (kind: Kinds<UiMouseEvent>, e: MouseEvent): UiMouseEvent => ({
        kind,
        position: getMousePosition(e),
        primary: isPrimary(this.mouse.buttons),
        double: false,
    });

    // mouse drag state management
    const dragThreshold = Distance(5, 'screen');
    const makeDragEvent = (e: UiMouseEvent, kind: Kinds<UiDragEvent>): UiDragEvent => ({
      kind,
      start: this.mouse.start,
      position: e.position,
      delta: Vectors.between(this.mouse.start, e.position),
      primary: e.primary,
    });

    const ignoreKeyEventsFrom = new Set([
      'input',
      'textarea',
    ]);

    const shouldIgnoreKeyEvent = (e: Event): boolean => {
      if (e.target && e.target instanceof HTMLElement) {
        return ignoreKeyEventsFrom.has(e.target.tagName.toLocaleLowerCase())
      }
      return false;
    };

    window.addEventListener('keydown', e => {
      if (shouldIgnoreKeyEvent(e)) return;
      this.events.handleKey(makeKeyEvent('keydown', e));
    });

    window.addEventListener('keyup', e => {
      if (shouldIgnoreKeyEvent(e)) return;
      this.events.handleKey(makeKeyEvent('keyup', e));
    });

    App.pane.addEventListener('contextmenu', e => e.preventDefault());

    App.pane.addEventListener('mousedown', e => {
      e.preventDefault();
      this.mouse.buttons = e.buttons;

      const activeElement = document.activeElement;
      if (activeElement?.tagName?.toLocaleLowerCase() === 'input') {
        (activeElement as HTMLInputElement).blur();
      }

      const event = makeMouseEvent('down', e);
      if (!event.primary) {
        const tool = App.tools.current;
        if (tool.name !== 'pan tool') {
          App.tools.set('pan tool');
          this.swappedTool = tool.name;
        }
      }

      this.mouse.start = event.position;
      this.mouse.distanceDragged = Distance(0, 'screen');
      this.mouse.pressed = true;

      this.events.handleMouse(makeMouseEvent('down', e));

      // close pop-up windows
      if (event.primary) {
        App.ecs.getComponents(Popup)
          .filter(p => p.closeOnUnfocus)
          .forEach(p => p.hide());
      }
    });

    App.pane.addEventListener('mousemove', e => {
      const event = makeMouseEvent('move', e);
      this.mouse.position = event.position;

      this.events.handleMouse(event);

      if (this.mouse.pressed) {
        if (!this.mouse.dragging) {
          this.mouse.distanceDragged = Spaces.calc(
            Distance,
            (a: number, b: number) => Math.max(a, b),
            this.mouse.distanceDragged,
            Distances.between(this.mouse.start, event.position),
          );
          if (this.mouse.distanceDragged.get('screen') >= dragThreshold.get('screen')) {
            this.mouse.dragging = true;
            this.events.handleDrag(makeDragEvent(event, 'start'));
          }
        }
        if (this.mouse.dragging) {
          this.events.handleDrag(makeDragEvent(event, 'update'));
        }
      }
    });

    App.pane.addEventListener('mouseup', e => {
      const event = makeMouseEvent('up', e);
      if (!event.primary && this.swappedTool !== null) {
        App.tools.set(this.swappedTool);
        this.swappedTool = null;
      }

      this.events.handleMouse(event);

      if (this.mouse.dragging) {
        this.events.handleDrag(makeDragEvent(event, 'end'));
      } else {
        this.events.handleMouse(makeMouseEvent('click', e));
      }

      this.mouse.dragging = false;
      this.mouse.pressed = false;
    });
  }
}

