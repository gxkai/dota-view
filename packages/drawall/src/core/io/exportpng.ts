import { App } from "@/core/app";
import { Imaged, ImageLayer } from "@/core/imaged";
import { unwrap } from "@/core/lib/minewt";

export class ImageExporter {
  private static readonly NOOP = () => {/* noop */};
  private readyListener: (() => void) = ImageExporter.NOOP;

  public setup() {
    App.renderReady.onChange(ready => {
      if (ready) {
        this.readyListener();
        this.readyListener = ImageExporter.NOOP;
      }
    });
  }

  private onReady(f: () => void) {
    if (App.renderReady.get()) {
      f();
      this.readyListener = ImageExporter.NOOP;
      return;
    }
    this.readyListener = f;
  }

  export() {
    App.renderReady.set(false);
    App.rendering.set(true);

    const canvases = Array.from(App.pane.children)
      .filter(c => c.tagName.toLocaleLowerCase() === 'canvas')
      .map(c => c as HTMLCanvasElement);
    const first = canvases[0]!;

    const compositing = document.createElement('canvas');
    compositing.width = first.width;
    compositing.height = first.height;
    compositing.style.width = `${first.width}px`;
    compositing.style.height = `${first.height}px`;
    compositing.style.opacity = '0';
    compositing.style.position = 'absolute';
    compositing.style.pointerEvents = 'none';

    this.onReady(() => {
      const dataUrls = canvases.map(c => c.toDataURL('image/png'));
      const loaded: Array<boolean> = new Array(dataUrls.length).fill(false);
      const images: Array<HTMLImageElement> = [];

      const renderComposite = () => {
        App.rendering.set(false);
        document.body.prepend(compositing);
        const g = compositing.getContext('2d')!;
        g.fillStyle = 'white';
        g.fillRect(0, 0, compositing.width+1, compositing.height+1);

        const renderImages = (layer: ImageLayer) => {
          const imgComponents = App.ecs.getComponents(Imaged)
            .filter(img => img.layer === layer);
          imgComponents.sort((a, b) => a.zindex - b.zindex);
          imgComponents.forEach(m => {
            const pos = m.center.get('screen');
            const width = m.width.get('screen');
            const height = m.height.get('screen');
            const angle = unwrap(m.rotation.get('screen'));
            const t = g.getTransform();
            g.translate(pos.x, pos.y);
            g.rotate(angle);
            g.globalAlpha = m.opacity.get();
            try {
              g.drawImage(m.image, -width/2, -height/2, width, height);
            } catch (e) {
              console.error(`error rendering a ${layer} image:`, e);
            }
            g.setTransform(t);
            g.globalAlpha = 1;
          });
        };

        if (App.settings.showReferenceImages.get()) {
          renderImages('reference');
        }

        for (let i = 0; i < images.length; i++) {
          const canvasImage = images[i];
          g.drawImage(canvasImage, 0, 0, canvasImage.width, canvasImage.height);

          if (i === 0 && App.settings.showFurniture.get()) {
            renderImages('furniture');
          }
        }
       
        App.io.download(
         `${App.project.projectName}.png`,
          compositing.toDataURL('image/png'),
        );
        document.body.removeChild(compositing);
      };

      dataUrls.forEach((url, i) => {
        const image = new Image();
        image.onload = () => {
          loaded[i] = true;
          if (loaded.every(b => b)) {
            renderComposite();
          }
        };
        image.src = url;
        images.push(image);
      });
    });
  }
}

