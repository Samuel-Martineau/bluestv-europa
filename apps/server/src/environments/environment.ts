import path = require('path');
import { Environment } from './environment.interface';

export const environment: Environment = {
  production: false,
  port: 3333,
  serviceAccountCredentialsPath: path.join(
    __dirname,
    '..',
    '..',
    '..',
    'secrets',
    'serviceAccountCredentials.json'
  ),
};
