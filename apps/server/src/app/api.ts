import { Router } from 'express';
import displayStreamController from './stream';
import googleDriveController from './drive';

googleDriveController.subscribe(
  displayStreamController.addFrameCollection.bind(displayStreamController)
);

const router = Router();

router.get('/force-reload', (req, res) => {
  googleDriveController.updateFrameCollection();
  displayStreamController.forceReload();
  res.redirect('/');
});

router.get('/stream', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const unsubscribe = displayStreamController.subscribe((v) => {
    res.write(`data: ${JSON.stringify(v)}\n\n`);
  });

  res.on('close', () => {
    res.end();
    unsubscribe();
  });
});

export default router;
