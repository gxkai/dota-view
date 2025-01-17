import { UiDragEvent, UiEventDispatcher } from "@/core/uievents";
import { Distance, Rect, Vectors } from "@/core/spaces";
import { Handle, Hovered } from "@/core/handles";
import { Refs } from "@/core/util";
import { Icons } from "@/core/icons";
import { Time } from "@/core/time";
import { Point, Vec } from "@/core/linalg";
import { Tool } from "@/core/tools-type";
import { App } from "@/core/app";
import { Wall } from "@/core/model";

export class PointerTool extends Tool {
  private readonly selectionRect = Refs.of<Rect | null>(null, (a, b) => {
    if ((a === null) !== (b === null)) {
      return false;
    }
    if (a === null || b === null) return true;
    return a.eq(b); 
  });
  private readonly strictSelect = Refs.of<boolean>(false);
  private lastClickHandle: Handle | null = null;
  private lastClickTime: number = 0;
  private lastClickPoint: Point = Point.ZERO;

  constructor() {
    super('pointer tool');
  }

  override get icon(): URL {
    return Icons.pointerTool;
  }

  override get allowSnap(): boolean {
    return true;
  }

  override setup() {
    this.strictSelect.onChange(strict => {
      if (strict) App.ui.clearHovered();
    });

    this.events.onKey('keydown', e => {
      if (e.key === 'Escape') {
        App.ui.clearSelection();
        App.ui.cancelDrag();
      }
    });

    this.events.onMouse('down', e => {
      const handle = App.ui.getHandleAt(
        e.position, 
        h => h.clickable || h.draggable || h.selectable
      );
      if (handle === null && !App.ui.multiSelecting) {
        App.ui.clearSelection();
      }
    });

    this.events.onMouse('click', e => {
      const doubleClicking = (Time.now - this.lastClickTime) < 0.5
        && Vec.between(e.position.get('screen'), this.lastClickPoint).mag() < 5;
      this.lastClickTime = Time.now;
      this.lastClickPoint = e.position.get('screen');

      const handle = App.ui.getHandleAt(e.position, h => h.clickable || h.selectable);
      if (handle === null) {
        if (doubleClicking) {
          const forOtherTool = App.ui.getHandleAt(e.position, h => h.clickable, true);
          if (forOtherTool) {
            forOtherTool.selectWithAppropriateTool();
            return;
          }
        }

        App.ui.clearSelection();
        this.lastClickHandle = null;
        return;
      }

      if (handle.clickable) {
        if (this.lastClickHandle === handle && doubleClicking) {
          // handle double-click
          if (handle.entity.has(Wall)) {
            // nb: we could reference it directly, but this will
            // make the UI buttons flicker, which is good for
            // letting ppl know where the tool is.
            App.tools.getTool('joint tool').events.handleMouse(e);
            return;
          }
        }
        this.lastClickHandle = handle;
        handle.events.handleMouse(e);
      }

      if (handle.selectable) {
        if (App.ui.multiSelecting) {
          if (handle.isSelected) {
            handle.selected = false;
          } else {
            App.ui.addSelection(handle);
          }
        } else {
          App.ui.setSelection(handle);
        }
      }
    });

    this.events.onMouse('move', e => {
      if (App.ui.dragging) return;

      const handle = App.ui.getHandleAt(e.position, h => h.clickable || h.draggable);

      if (handle?.clickable || handle?.draggable) {
        App.pane.style.cursor = handle.getContextualCursor() || this.cursor;
        if (handle.control) {
          handle.hovered = true;
        } else {
          App.ui.setHovered(handle);
        }
        return;
      }

      App.pane.style.cursor = this.cursor;
      App.ui.clearHovered();
    });

    const drawSelect = this.getDrawSelectDispatcher();

    this.events.addDragListener<UiEventDispatcher>({
      onStart: e => {
        const overHandle = App.ui.getHandleAt(e.start, h => h.draggable) !== null;
        if (overHandle) {
          const handler = App.ui.defaultDragHandler;
          handler.handleDrag(e);
          return handler;
        }
        drawSelect.handleDrag(e);
        return drawSelect;
      },
      onUpdate: (e, dispatcher) => dispatcher.handleDrag(e),
      onEnd: (e, dispatcher) => {
        dispatcher.handleDrag(e);
        App.pane.style.cursor = 'default';
      },
    });
  }

  override update() {
    if (App.rendering.get()) return;

    this.renderKnobs();

    const rect = this.selectionRect.get();
    if (rect === null) return;

    const palette = this.strictSelect.get() 
      ? ['hsla(348,79%,81%,0.3)', 'hsla(348,79%,20%,0.3)'] 
      : ['hsla(196,94%,66%,0.3)', 'hsla(196,94%,20%,0.3)'];

    const [fill, stroke] = palette;

    App.canvas.fillStyle = fill;
    App.canvas.strokeStyle = stroke;
    App.canvas.lineWidth = 1;
    App.canvas.rect(rect);
    App.canvas.fill();
    App.canvas.stroke();
  }

  private renderKnobs() {
    const selectionSize = App.ui.selection.size;
    const hovered = App.ecs.getComponents(Hovered);
    if (hovered.length > 2) return;
    const handleDrawRadius = Distance(100, 'screen');
    const shouldRender = (h: Handle): boolean => {
      if (h.knob === null) return false;
      if (h.dragging) return true;
      const parent = h.knob.parent.only(Handle);
      return selectionSize <= 1 && parent.isActive && hovered.every(hovered => {
        const handle = hovered.entity.only(Handle);
        return handle === parent || handle === h;
      });
    };
    const handles = App.ecs.getComponents(Handle).filter(shouldRender);
    for (const h of handles) {
      App.ui.renderKnob(h);
    }
  }

  private getDrawSelectDispatcher(): UiEventDispatcher {
    const dispatcher = new UiEventDispatcher(PointerTool, 'Rectangular Select');
    const rectFor = (e: UiDragEvent) => {
      const rect = new Rect(e.start, e.position);
      this.selectionRect.set(rect);
      return rect;
    };
    dispatcher.addDragListener<0>({
      onStart: e => {
        App.pane.style.cursor = 'default';
        rectFor(e);
        return 0;
      },
      onUpdate: (e, _) => {
        App.pane.style.cursor = 'default';
        const rect = rectFor(e);
        const strict = this.useStrictSelectFor(e);
        this.strictSelect.set(strict);
        const selectables = App.ecs.getComponents(Handle)
          .filter(h => h.selectable && h.visible && !h.control && h.isForTool(this.name));
        for (const s of selectables) {
          s.hovered = strict ? s.containedBy(rect) : s.intersects(rect);
        }
      },
      onEnd: (e, _) => {
        App.pane.style.cursor = 'default';
        const selected = App.ecs.getComponents(Hovered)
          .map(h => h.entity.only(Handle));
        App.ui.clearHovered(); 
        App.ui.addSelection(...selected);
        this.selectionRect.set(null);
      },
    });
    return dispatcher;
  }

  private useStrictSelectFor(e: UiDragEvent): boolean {
    const delta = Vectors.between(e.start, e.position).get('screen');
    return delta.x < 0 && delta.y < 0;
  }
}

// App.tools.register(PointerTool);

