import { UiEventDispatcher } from "@/core/uievents";
import { Cursor } from "@/core/cursors";
import { AutoForm } from "@/core/controls";

export type ToolName = 'none'
  | 'furniture tool'
  | 'images tool'
  | 'joint tool'
  | 'pan tool'
  | 'pointer tool'
  | 'room tool'
  | 'ruler tool'
  ;

export abstract class Tool {
  public readonly events = new UiEventDispatcher(
    this.constructor as (new (...args: unknown[]) => unknown)
  );

  constructor(
    public readonly name: ToolName,
  ) {
  }

  get allowSnap(): boolean {
    return false;
  }

  get description(): string {
    return '';
  }

  get icon(): URL | null {
    return null;
  }

  get cursor(): Cursor {
    return 'default';
  }

  createUi(form: AutoForm): void {
  }

  onToolSelected() {
  }

  onToolDeselected() {
  }

  abstract update(): void;

  abstract setup(): void;
}

export interface ToolGroup {
  readonly name: string;
  readonly tools: ToolName[];
  readonly icon?: URL;
  current: ToolName;
}

export type ToolKind<T extends Tool> = new () => T;

export class NoopTool extends Tool {
  constructor() {
    super('none');
  }

  override setup() {}
  override update() {}
}

export class ToolChain {
  public readonly groups: ToolGroup[] = [];
  private readonly groupMap = new Map<string, ToolGroup>();

  getGroup(name: string): ToolGroup {
    return this.groupMap.get(name)!;
  }

  addSingle(tool: ToolName): ToolChain {
    return this.addGroup(tool, [ tool ]);
  }

  addGroup(name: string, tools: ToolName[], icon?: URL): ToolChain {
    if (this.groupMap.has(name)) {
      throw new Error(`Cannot overwrite tool group ${name}.`);
    }
    if (tools.length === 0) {
      throw new Error(`Cannot create empty tool group ${name}.`);
    }
    const group = { name, tools, icon, current: tools[0] };
    this.groups.push(group);
    this.groupMap.set(name, group);
    return this;
  }
}