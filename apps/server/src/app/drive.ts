import { Listenable, sleep } from '@europa/shared';
import { drive_v3, google } from 'googleapis';
import { environment } from '../environments/environment';
import fs from 'fs';
import path from 'path';
import { streamToBytes } from './utils';
import { DisplayStreamFrame, DisplayStreamFrameCollection } from './stream';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import stream from 'stream/promises';
import { PDFDocument } from 'pdf-lib';
import YAML from 'yaml';
import { z } from 'zod';
import ms from 'ms';

class GoogleDriveController extends Listenable<DisplayStreamFrameCollection> {
  private static readonly rootContentDir = path.join(
    __dirname,
    'assets',
    'content'
  );
  private static readonly frameTypeExtension: Record<
    Exclude<DisplayStreamFrame['type'], 'color'>,
    string
  > = {
    pdf: 'pdf',
    image: 'png',
    video: 'mp4',
  };
  private static readonly mimeTypes: Record<
    string,
    { frameType: DisplayStreamFrame['type']; exporter: string | false }
  > = {
    'application/vnd.google-apps.presentation': {
      frameType: 'pdf',
      exporter: 'application/pdf',
    },
    'image/png': {
      frameType: 'image',
      exporter: false,
    },
    'image/jpeg': {
      frameType: 'image',
      exporter: false,
    },
  };
  private static readonly allowedMimeTypes = Object.keys(
    GoogleDriveController.mimeTypes
  );

  private readonly auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive'],
    keyFile: environment.serviceAccountCredentialsPath,
  });
  private readonly drive = google.drive({ version: 'v3', auth: this.auth });

  constructor() {
    super();
    fs.rmSync(GoogleDriveController.rootContentDir, {
      recursive: true,
      force: true,
    });
    this.poll();
    this.updateFrameCollection();
  }

  private static async makeContentDir(): Promise<string> {
    const p = path.join(GoogleDriveController.rootContentDir, uuidv4());
    await fs.promises.mkdir(p, { recursive: true });
    return p;
  }

  private async poll() {
    const delay = '5m';

    while (true) {
      try {
        let token = (await this.drive.changes.getStartPageToken()).data
          .startPageToken;
        if (!token) throw new Error('No start page token');
        while (true) {
          try {
            const changes: drive_v3.Schema$Change[] = [];
            let done = false;
            do {
              const { data } = await this.drive.changes.list({
                pageToken: token,
                includeRemoved: true,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                supportsTeamDrives: true,
              });
              if (data.changes) changes.push(...data.changes);
              if (data.newStartPageToken) {
                done = true;
                token = data.newStartPageToken as string;
              } else token = data.nextPageToken as string;
            } while (!done);

            if (changes.length > 0) {
              let shouldUpdateFrames = false;
              for (const { file: changedFile } of changes) {
                if (!changedFile?.id) throw new Error('File without file id');
                if (!changedFile?.mimeType)
                  throw new Error('File without mime type');

                // Is the file the configuration file?
                if (
                  changedFile.id ===
                  '182TlnBgtd8mmKVZeMAjs_cVVI1sTUAIfwx0IkTA6VvM'
                ) {
                  shouldUpdateFrames = true;
                  break;
                }

                // Is the file a Google Slides?
                if (
                  !GoogleDriveController.allowedMimeTypes.includes(
                    changedFile.mimeType
                  )
                )
                  continue;

                // Is the file in the "approved" folder
                const { data: file } = await this.drive.files.get({
                  fileId: changedFile.id,
                });
                if (
                  file.parents?.includes('1Mq938udN54ZjivPjdv0Z4D_zcokmJfeU')
                ) {
                  shouldUpdateFrames = true;
                  break;
                }
              }
              try {
                if (shouldUpdateFrames) this.updateFrameCollection();
              } catch (error) {
                console.error(error);
              }
            }
          } catch (e) {
            console.error(e);
          } finally {
            await sleep(delay);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        await sleep(delay);
      }
    }
  }

  async updateFrameCollection() {
    const dir = await GoogleDriveController.makeContentDir();

    const settingsSchema = z.object({
      duration: z.string().refine(
        (v) => typeof ms(v) === 'number' && ms(v) >= 1000,
        (v) => ({ message: `"${v}" is an invalid time string` })
      ),
    });
    const settings = settingsSchema.parse(
      YAML.parse(
        (
          await this.drive.files.export({
            fileId: '182TlnBgtd8mmKVZeMAjs_cVVI1sTUAIfwx0IkTA6VvM',
            mimeType: 'text/plain',
          })
        ).data as string
      )
    );

    const frameCollection: DisplayStreamFrameCollection = {
      id: uuidv4(),
      path: dir,
      frames: [],
      settings,
    };

    const files: drive_v3.Schema$File[] = [];
    let done = false;
    let pageToken: string | undefined;

    do {
      const { data } = await this.drive.files.list({
        pageToken,
        q: "'1Mq938udN54ZjivPjdv0Z4D_zcokmJfeU' in parents",
      });
      if (data.files) files.push(...data.files);
      if (data.nextPageToken) pageToken = data.nextPageToken;
      done = !pageToken;
    } while (!done);

    for (const file of files) {
      if (!file.id) throw new Error('File without file id');
      if (!file.mimeType) throw new Error('File without mime type');

      if (!GoogleDriveController.allowedMimeTypes.includes(file.mimeType))
        throw new Error('File with invalid mime type' + JSON.stringify(file));

      const { exporter, frameType } =
        GoogleDriveController.mimeTypes[file.mimeType];
      const getDownloadPath = () =>
        path.join(
          dir,
          `${uuidv4()}.${GoogleDriveController.frameTypeExtension[frameType]}`
        );

      const { data: downloadStream } = await (exporter
        ? this.drive.files.export(
            {
              fileId: file.id,
              mimeType: exporter,
            },
            { responseType: 'stream' }
          )
        : this.drive.files.get(
            { fileId: file.id, alt: 'media' },
            { responseType: 'stream' }
          ));

      switch (frameType) {
        case 'image': {
          const p = getDownloadPath();
          await stream.pipeline(
            downloadStream,
            sharp().jpeg({ mozjpeg: true }),
            fs.createWriteStream(p)
          );
          frameCollection.frames.push({
            type: 'image',
            path: path.relative(__dirname, p),
          });
          break;
        }
        case 'pdf': {
          const documentAsBytes = await streamToBytes(downloadStream);
          const document = await PDFDocument.load(documentAsBytes);
          const numberOfPages = document.getPages().length;
          for (let i = 0; i < numberOfPages; i++) {
            const subDocument = await PDFDocument.create();
            const [copiedPage] = await subDocument.copyPages(document, [i]);
            subDocument.addPage(copiedPage);
            const pdfBytes = await subDocument.save();
            const p = getDownloadPath();
            await fs.promises.writeFile(p, pdfBytes);
            frameCollection.frames.push({
              type: 'pdf',
              path: path.relative(__dirname, p),
            });
          }
          break;
        }
        default: {
          console.error('Unexpected File : ', file);
        }
      }
    }

    this.notifyListeners(frameCollection);
  }
}

export default new GoogleDriveController();
