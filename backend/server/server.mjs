// RAD Chat host: serves the React app, forwards /api to the Python API and starts that API itself.
//   npm start        (zie README.md; eerst één keer "npm run setup")
import { Application } from './Application.mjs';
import { Config } from './Config.mjs';

new Application(Config.load()).start();
