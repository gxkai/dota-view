import { Icons } from "@/core/icons";
import { Cursor } from "@/core/cursors";
import { Tool } from "@/core/tools-type";
import { App } from "@/core/app";

export class PanTool extends Tool {
  constructor() {
    super('pan tool');
  }

  override get icon(): URL {
    return Icons.panTool;
  }

  override get cursor(): Cursor {
    return 'grab';
  }

  override get description(): string {
    return 'middle-click + drag, right-click + drag, or hold Alt';
  }

  override setup() {
    this.events.addDragListener({
      onStart: (e) => {
        // have to save original transformations
        return ({
          origin: App.viewport.origin,
          project: App.viewport.project,
          unproject: App.viewport.unproject,
        });
      },
      onUpdate: (e, context) => {
        const { origin, project, unproject } = context;
        App.viewport.origin = origin.minus(unproject.vec(e.delta.get('screen')));
        App.viewport.updateTransforms();
        return context;
      },
      onEnd: (e, context) => {
      },
    });
  }

  override update() {}
}

// App.tools.register(PanTool);

