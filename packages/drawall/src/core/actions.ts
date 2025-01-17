import { Ref } from "@/core/util";
import { App } from "@/core/app";
import { formatKeyStroke, KeyStroke } from "@/core/hotkeys";
import { ToolName } from "@/core/tools";

export type UserActionId = ToolName
  | 'noop'
  | 'toggle-snap'
  | 'toggle-kinematics'
  | 'loop-select'
  | 'select-all'
  | 'recenter'
  | 'undo'
  | 'redo'
  | 'flip-h'
  | 'flip-v'
  | 'zoom-in'
  | 'zoom-out'
  | 'export-png'
  | 'save'
  | 'open'
  | 'new'
  | 'toggle-debug'
;

export interface UserAction {
  name: UserActionId,
  apply: () => void;
}

export class UserActions {
  private readonly map = new Map<UserActionId, UserAction>();

  constructor() {
  }

  setup() {
    const add = (name: UserActionId, apply: () => void) => this.register({
      name, apply
    });
    const toggle = (name: UserActionId, ref: Ref<boolean>) => add(name, () => ref.set(!ref.get()));

    toggle('toggle-snap', App.ui.snapping.enableByDefaultRef);
    toggle('toggle-kinematics', App.settings.kinematics);

    add('toggle-debug', () => {
      App.debug = !App.debug;
    });

    add('loop-select', () => App.ui.loopSelect());
    add('select-all', () => App.ui.selectAll());

    add('recenter', () => App.viewport.recenter());
    add('zoom-in', () => App.viewport.zoomIn());
    add('zoom-out', () => App.viewport.zoomOut());

    add('undo', () => App.history.undo());
    add('redo', () => App.history.redo());

    add('flip-h', () => App.ui.flip('horizontal'));
    add('flip-v', () => App.ui.flip('vertical'));

    add('new', () => App.project.newProject());
    add('open', () => App.project.openProject());
    add('save', () => App.project.saveProject());

    add('export-png', () => App.imageExporter.export());
    // add('foo', () => doFoo());
  }

  register(action: UserAction) {
    if (this.map.has(action.name)) {
      throw new Error(`Already bound action ${action}.`);
    }
    this.map.set(action.name, action);
  }

  get(action: UserActionId): UserAction {
    return this.map.get(action)!;
  }

  get actions(): UserActionId[] {
    return Array.from(this.map.keys());
  }

  fire(action: UserActionId) {
    this.get(action).apply();
  }

  public evaluateKeybindings(): boolean {
    const stroke: KeyStroke = {
      keys: App.ui.pressedKeys,
    };
    const hotkey = App.keybindings.match(stroke);
    if (hotkey !== null) {
      const action = this.get(hotkey.action);
      App.log('executing keybinding', formatKeyStroke(hotkey.stroke), ':', action.name);
      action.apply();
      return true;
    }
    return false;
  }
}

