import express from 'express';
import * as path from 'path';
import { environment } from './environments/environment';
import helmet from 'helmet';
import apiRouter from './app/api';

const app = express();
if (environment.production) app.use(helmet());
else
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });

app.use('/assets', express.static(path.join(__dirname, 'assets')));
if (environment.production)
  app.use(
    '/display',
    express.static(path.join(__dirname, '..', 'client-display'))
  );

app.use('/api', apiRouter);

const server = app.listen(environment.port, () => {
  console.log(`Listening at http://localhost:${environment.port}`);
});
server.on('error', console.error);
