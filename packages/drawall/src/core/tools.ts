import { Ref, Refs } from "@/core/util";
import { UiEventDispatcher } from "@/core/uievents";
import { Cursor } from "@/core/cursors";
import { formatKeyStroke } from "@/core/hotkeys";
import { AutoForm, IconButton } from "@/core/controls";
import { App } from "@/core/app";
import { RulerTool } from "@/core/tools/ruler";
import { NoopTool, Tool, ToolChain, ToolGroup, ToolKind, ToolName } from "@/core/tools-type";
import { FurnitureTool } from "@/core/tools/furnishingstool";
import { ImagesTool } from "@/core/tools/images";
import { JointTool } from "@/core/tools/joint";
import { PanTool } from "@/core/tools/pan";
import { PointerTool } from "@/core/tools/pointer";
import { DrawRoomTool } from "@/core/tools/room";



export class Tools {
  private readonly registry = new Map<ToolName, Tool>();
  private readonly toolListeners = new Array<(tool: ToolName) => void>();
  private readonly stack = new Array<ToolName>();

  private _current: Ref<Tool> = Refs.of(
    new NoopTool(),
    (a, b) => a.name === b.name,
  );

  public readonly chain = new ToolChain()
    .addSingle('pointer tool')
    .addSingle('pan tool')
    .addSingle('room tool')
    .addSingle('ruler tool')
    .addSingle('joint tool')
    .addSingle('furniture tool')
    .addSingle('images tool')
  ;

  public get current(): Tool {
    return this._current.get();
  }

  public get currentRef(): Ref<Tool> {
    return this._current;
  }

  public pushTool() {
    this.stack.push(this.current.name);
  }

  public popTool(): ToolName | null {
    const tool = this.stack.pop();
    if (typeof tool !== 'undefined') {
      this.set(tool);
      return tool;
    }
    return null;
  }

  public register<T extends Tool>(kind: ToolKind<T>) {
    const tool = new kind();
    if (this.registry.has(tool.name)) {
      const existing = this.registry.get(tool.name)!;
      throw new Error(`Cannot register ${tool.name} to ${kind.name}, because it would overwrwite ${existing.constructor.name}.`);
    }
    this.registry.set(tool.name, tool);

    // register action to switch to this tool (can be used by hotkeys)
    App.actions.register({ name: tool.name, apply: () => this.set(tool.name) });

    App.log('registered tool', tool.name, tool);
  }

  public getTools(): Tool[] {
    return Array.from(this.registry.values());
  }

  public getTool(name: ToolName): Tool {
    return this.registry.get(name)!;
  }

  public set(name: ToolName) {
    if (this.current.name === name) {
      return;
    }
    const previous = this.current;
    const tool = this.registry.get(name)!;
    this.toolListeners.forEach(listener => listener(name));
    this._current.set(tool);
    App.pane.style.cursor = tool.cursor;
    App.gui.tool.clear();
    App.ui.clearSelection();
    App.ui.cancelDrag();
    const ui = new AutoForm();
    tool.createUi(ui)
    ui.inflate(App.gui.tool);
    previous.onToolDeselected();
    tool.onToolSelected();
  }

  update() {
    this.current.update();
  }

  private allToolsRegistered(): boolean {
    return this.chain.groups.every(
      group => group.tools.every(
        tool => this.registry.has(tool)
      )
    );
  }

  setup() {
    this.register(FurnitureTool)
    this.register(ImagesTool)
    this.register(JointTool)
    this.register(PanTool)
    this.register(PointerTool)
    this.register(DrawRoomTool)
    this.register(RulerTool);
    for (const tool of this.registry.values()) {
      tool.setup();
    }

    const toolbar = document.getElementsByClassName('toolbar')[0]! as HTMLElement;
    this.chain.groups.forEach(group => this.setupToolGroup(toolbar, group));
    this.set('pointer tool');
  }

  private setupToolGroup(toolbar: HTMLElement, group: ToolGroup) {
    const tools = group.tools.map(name => this.registry.get(name)!);
    const icon = group.icon || (tools.length === 1 ? tools[0].icon : undefined);
    const button = new IconButton(group.name, icon);
    toolbar.appendChild(button.element);

    button.onClick(() => this.set(group.current));

    this.toolListeners.push(tool => {
      button.selected = new Set(group.tools).has(tool);
    });

    if (tools.length === 1) {
      button.tooltip = this.getTooltip(group.tools[0]!);
      return; // don't need to add group options.
    }
  }

  private createToolButton(tool: Tool): HTMLElement {
    const button = new IconButton(tool.name, tool.icon);
    return button.element;
  }

  private getTooltip(tool: ToolName): string {
    const parts: string[] = [tool];
    const keybinds = App.keybindings.values()
      .filter(kb => kb.action === tool)
      .map(kb => formatKeyStroke(kb.stroke))
      .join(' or ');
    if (keybinds.length > 0) {
      parts.push(`(${keybinds})`);
    }
    const description = this.registry.get(tool)!.description;
    if (description.length > 0) {
      parts.push(`— ${description}`);
    }
    return parts.join(' ');
  }
}

