/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { sleep } from '@europa/shared';
import type * as pdfjs from 'pdfjs-dist';
import { environment } from './environments/environment.prod';
declare const pdfjsLib: typeof pdfjs;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.js';

let previousPdfDocument: pdfjs.PDFDocumentProxy;

const canvas1 = document.querySelector('#canvas1') as HTMLCanvasElement;
const context1 = canvas1.getContext('2d')!;
const canvas2 = document.querySelector('#canvas2') as HTMLCanvasElement;
const context2 = canvas2.getContext('2d')!;
const canvasses = [canvas1, canvas2];
const contexts = [context1, context2];
let canvassesIndex = 0;

const image1 = document.querySelector('#image1') as HTMLImageElement;
const image2 = document.querySelector('#image2') as HTMLImageElement;
const images = [image1, image2];
let imagesIndex = 0;

const colorDiv = document.querySelector('#color') as HTMLDivElement;

function hideOthers(toKeep: HTMLElement) {
  for (const el of [...canvasses, ...images, colorDiv])
    if (el !== toKeep) el.style.opacity = '0%';
}
async function show(toShow: HTMLElement) {
  toShow.style.opacity = '100%';
  toShow.style.animation = 'fadeIn 0.5s linear';
  toShow.style.zIndex = '1000';
  for (const el of [...canvasses, ...images, colorDiv])
    if (el !== toShow) el.style.zIndex = '0';
  await sleep('0.5s');
  toShow.style.animation = '';
}

const pathToUrl = (path: string) =>
  environment.production ? `/../${path}` : `http://localhost:3333/${path}`;

(async function () {
  const eventSource = new EventSource(pathToUrl('api/stream'));
  eventSource.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'color') displayColor(data.color);
    else if (data.type === 'image') displayImage(data.path);
    else if (data.type === 'pdf') displayPdf(data.path);
  });
})();

async function displayColor(color: string) {
  colorDiv.style.backgroundColor = color;
  if (colorDiv.style.opacity !== '1') await show(colorDiv);
  hideOthers(colorDiv);
}

async function displayImage(path: string) {
  const image = images[(imagesIndex++, (imagesIndex %= images.length))];

  image.addEventListener(
    'load',
    async () => {
      await show(image);
      hideOthers(image);
    },
    { once: true }
  );

  const url = pathToUrl(path);
  image.src = url;
}

async function displayPdf(path: string) {
  const canvas =
    canvasses[(canvassesIndex++, (canvassesIndex %= canvasses.length))];
  const context = contexts[canvassesIndex];

  const url = pathToUrl(path);

  await previousPdfDocument?.destroy();

  const doc = await pdfjsLib.getDocument(url).promise;
  previousPdfDocument = doc;
  const page = await doc.getPage(1);

  const viewport = page.getViewport({ scale: 1 });
  const widthIsLimiting = window.innerWidth / 16 <= window.innerHeight / 9;
  const scale = widthIsLimiting
    ? window.innerWidth / viewport.width
    : window.innerHeight / viewport.height;
  const scaledViewport = page.getViewport({ scale });
  const outputScale = window.devicePixelRatio || 1;

  canvas.width = Math.floor(scaledViewport.width * outputScale);
  canvas.height = Math.floor(scaledViewport.height * outputScale);
  canvas.style.width = Math.floor(scaledViewport.width) + 'px';
  canvas.style.height = Math.floor(scaledViewport.height) + 'px';

  const transform =
    outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

  const renderContext = {
    canvasContext: context,
    transform: transform,
    viewport: scaledViewport,
  };

  page.cleanupAfterRender = true;
  page.render(renderContext);

  await show(canvas);
  hideOthers(canvas);
}
