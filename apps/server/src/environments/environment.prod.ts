import path from 'path';
import { Environment } from './environment.interface';

export const environment: Environment = {
  production: true,
  port: 8080,
  serviceAccountCredentialsPath:
    process.env.SERVICE_ACCOUNT_CREDENTIALS_PATH ||
    path.join(
      __dirname,
      '..',
      '..',
      '..',
      'secrets',
      'serviceAccountCredentials.json'
    ),
};
