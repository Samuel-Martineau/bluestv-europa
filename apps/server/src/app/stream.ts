import { Listenable, sleep } from '@europa/shared';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';

fs.mkdtemp;

export type DisplayStreamFrame =
  | {
      type: 'color';
      color: string;
    }
  | {
      type: 'image';
      path: string;
    }
  | {
      type: 'pdf';
      path: string;
    }
  | {
      type: 'video';
      path: string;
    };

export type DisplayStreamFrameCollection = {
  id: string;
  path?: string;
  settings: {
    duration: string;
  };
  frames: DisplayStreamFrame[];
};

class DisplayStreamController extends Listenable<DisplayStreamFrame> {
  private static get loadingFrameCollection(): DisplayStreamFrameCollection {
    return {
      id: uuidv4(),
      settings: {
        duration: '3s',
      },
      frames: [
        {
          type: 'color',
          color: '#000000',
        },
      ],
    };
  }

  private frames: DisplayStreamFrameCollection[] = [
    DisplayStreamController.loadingFrameCollection,
  ];

  private forceReloadRequested = false;
  private forceReloadResolve: () => void;
  private forceReloadPromise = new Promise<void>(
    (r) => (this.forceReloadResolve = r)
  );

  constructor() {
    super();
    this.loop();
  }

  private async loop() {
    while (true) {
      const collectionToKeep = this.frames.pop();
      if (!collectionToKeep) {
        await sleep('10s');
        continue;
      }
      this.frames.forEach((c) => c.path && fs.rm(c.path, { recursive: true }));
      this.frames = [collectionToKeep];

      const { settings, frames } = this.frames[0];
      for (const f of frames) {
        if (this.forceReloadRequested) {
          this.forceReloadRequested = false;
          this.forceReloadPromise = new Promise(
            (r) => (this.forceReloadResolve = r)
          );
          break;
        }
        this.notifyListeners(f);
        await Promise.race([sleep(settings.duration), this.forceReloadPromise]);
      }
    }
  }

  addFrameCollection(frameCollection: DisplayStreamFrameCollection) {
    this.frames.push(frameCollection);
  }

  forceReload() {
    this.frames = [DisplayStreamController.loadingFrameCollection];
    this.forceReloadRequested = true;
    this.forceReloadResolve();
  }
}

export default new DisplayStreamController();
