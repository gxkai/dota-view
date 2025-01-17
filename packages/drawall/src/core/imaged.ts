import { Component, ComponentFactories, Entity } from "@/core/ecs";
import { Form } from "@/core/ux";
import { impossible, Ref, Refs } from "@/core/util";
import { AutoForm } from "@/core/controls";
import { Icons } from "@/core/icons";
import { toDegrees } from "@/core/linalg";
import { SavedComponent } from "@/core/io/json";
import { Rectangular } from "@/core/rectangular";
import { Distance, Position } from "@/core/spaces";
import { App } from "@/core/app";

export type ImageLayer = 'reference' | 'furniture';

export const getImageLayerCanvas = (layer: ImageLayer): HTMLElement => {
  if (layer === 'reference') return App.referenceImages;
  if (layer === 'furniture') return App.furnitureImages;
  return impossible(layer);
};

export class Imaged extends Component {
  public static readonly DEFAULT_OPACITY = 0.5;

  private static ZINDEX_ARRAY = Array<Imaged>();

  private readonly canvas: HTMLElement;
  private readonly element: HTMLImageElement;
  private readonly rect: Rectangular;
  private readonly zindexRef: Ref<number> = Refs.of(0);
  private readonly form: Form;

  public readonly image: HTMLImageElement;
  public readonly opacity: Ref<number>;
  public readonly layer: ImageLayer;

  constructor(
    entity: Entity,
    layer: ImageLayer,
    rect?: Rectangular,
  ) {
    super(entity);
    this.image = new Image();

    this.zindexRef.set(Imaged.ZINDEX_ARRAY.length);
    Imaged.ZINDEX_ARRAY.push(this);

    this.rect = typeof rect !== 'undefined'
      ? rect : entity.getOrCreate(Rectangular);
    this.rect.keepAspect = true;

    if (layer === 'reference') {
      this.rect.createHandle({
        tools: ['images tool'],
      });
    }

    this.opacity = Refs.of(layer === 'reference' ? Imaged.DEFAULT_OPACITY : 1);

    this.element = new Image();
    this.element.style.position = 'absolute';
    this.element.style.display = 'none';
    this.updateElement();

    this.layer = layer;
    this.canvas = getImageLayerCanvas(this.layer);
    this.canvas.appendChild(this.element);

    this.rect.centerRef.onChange(_ => this.updateElement());
    this.rect.widthRef.onChange(_ => this.updateElement());
    this.rect.heightRef.onChange(_ => this.updateElement());
    this.rect.rotationRef.onChange(_ => this.updateElement());
    this.opacity.onChange(o => {
      this.element.style.opacity = `${o}`;
      App.project.requestSave('image opacity changed');
    });

    this.form = entity.add(Form, () => {
      const form = new AutoForm();
      form.addButton({
        name: 'Upload Image',
        icon: Icons.imageUpload,
        onClick: () => {
          const img = entity.getOrCreate(Imaged, 'furniture');
          img.showUploadForm();
        },
      });
      form.add({
        kind: 'slider',
        name: 'opacity',
        label: 'opacity',
        value: this.opacity,
        min: 0,
        max: 1,
      });
      form.addButton({
        name: 'Send to Back',
        icon: Icons.toBack,
        onClick: () => this.toBack(),
      });
      form.addButton({
        name: 'Bring to Front',
        icon: Icons.toFront,
        onClick: () => this.toFront(),
      });
      form.addButton({
        name: 'Reset Aspect Ratio',
        icon: Icons.resetAspectRatio,
        onClick: () => this.resetAspectRatio(),
      });
      return form;
    });
  }

  get zindex(): number {
    return this.zindexRef.get();
  }

  get width() {
    return this.rect.width;
  }

  set width(d: Distance) {
    this.rect.width = d;
  }

  get height() {
    return this.rect.height;
  }

  set height(d: Distance) {
    this.rect.height = d;
  }

  get center() {
    return this.rect.center;
  }

  set center(p: Position) {
    this.rect.center = p;
  }

  get rotation() {
    return this.rect.rotation;
  }

  public setSrc(url: string | URL) {
    this.image.onload = () => {
      App.project.requestSave('image uploaded');
      if (!this.rectHasSize()) {
        this.rectToImageDimensions();
      }
      this.updateElement();
    };
    this.image.src = url.toString();
    this.element.src = url.toString();
    if (!this.rectHasSize()) {
      this.rectToImageDimensions();
    }
    this.updateElement();
    // idk what race condition i have that makes this help =/
    setTimeout(() => this.updateElement(), 100);
  }

  public toBack() {
    this.canvas.removeChild(this.element);
    this.canvas.prepend(this.element);
    Imaged.ZINDEX_ARRAY.splice(this.zindexRef.get(), 1);
    Imaged.ZINDEX_ARRAY.unshift(this);
    this.zindexRef.set(0);
  }

  public toFront() {
    this.canvas.removeChild(this.element);
    this.canvas.appendChild(this.element);
    Imaged.ZINDEX_ARRAY.splice(this.zindexRef.get(), 1);
    Imaged.ZINDEX_ARRAY.push(this);
    this.zindexRef.set(Imaged.ZINDEX_ARRAY.length - 1);
  }

  public updateElement() {
    const pos = this.center.get('screen');
    const width = this.width.get('screen');
    const height = this.height.get('screen');
    const angle = toDegrees(this.rect.rotation.get('screen'));
    this.element.style.opacity = `${this.opacity.get()}`;
    this.element.style.left = `${pos.x}px`;
    this.element.style.top = `${pos.y}px`;
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
    this.element.style.transform = `translate(-${width/2}px, -${height/2}px) rotate(${angle}deg)`;
    this.element.style.display = width > 0 && height > 0 ? 'block' : 'none';
  }

  public showUploadForm() {
    App.io.open([
      '.gif',
      '.jpeg',
      '.jpg',
      '.png',
      '.svg',
      '.webm',
    ], url => this.setSrc(url));
  }

  public cleanup() {
    if (this.layer === 'reference' && !this.image.src) {
      this.entity.destroy();
    }
  }

  private resetAspectRatio() {
    this.rect.keepAspect = false;
    const ratio = this.image.width / this.image.height;
    this.rect.width = this.rect.height.scale(ratio);
    this.rect.keepAspect = true;
  }

  private rectToImageDimensions() {
    const keepAspect = this.rect.keepAspect;
    this.rect.keepAspect = false;
    this.width = Distance(this.image.width, 'screen');
    this.height = Distance(this.image.height, 'screen');
    this.rect.keepAspect = keepAspect;
  }

  private rectHasSize() {
    const w = this.width.get('screen');
    const h = this.height.get('screen');
    return w > 1 && h > 1;
  }

  private getDataUrl() {
    const canvas = document.createElement('canvas');
    canvas.width = this.image.width;
    canvas.height = this.image.height;
    const g = canvas.getContext('2d')!;
    g.drawImage(this.image, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl;
  }

  private getStableUrl() {
    const src = this.image.src;
    if (src.startsWith('blob:')) {
      return this.getDataUrl();
    }
    return src;
  }

  tearDown() {
    if (Imaged.ZINDEX_ARRAY[this.zindexRef.get()] === this) {
      Imaged.ZINDEX_ARRAY.splice(this.zindexRef.get(), 1);
    }
    this.element.parentNode?.removeChild(this.element);
    this.entity.remove(this.form);
  }

  toJson(): SavedComponent {
    return {
      factory: this.constructor.name,
      arguments: [
        this.getStableUrl(),
        this.opacity.get(),
        this.layer,
      ],
    };
  }
}

ComponentFactories.register(Imaged, (
  entity: Entity,
  url: string,
  opacity: number,
  layer: ImageLayer,
) => {
  const imaged = entity.getOrCreate(Imaged, layer);
  imaged.setSrc(url);
  imaged.opacity.set(typeof opacity !== 'undefined'
    ? opacity : Imaged.DEFAULT_OPACITY);
  return imaged;
});

