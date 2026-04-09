/**
 * Connectors module — public surface.
 *
 * Side-effect: registers all built-in connectors with the registry on import.
 */

import { registerConnector } from './connectorRegistry.js';
import { genericHttpConnector } from './instances/genericHttpConnector.js';
import {
  googleDriveConnector,
  salesforceConnector,
  slackConnector,
  docusignConnector,
  faxHttpConnector,
} from './instances/stubConnectors.js';

let registered = false;
function registerBuiltins() {
  if (registered) return;
  registered = true;
  registerConnector(googleDriveConnector);
  registerConnector(salesforceConnector);
  registerConnector(slackConnector);
  registerConnector(docusignConnector);
  registerConnector(faxHttpConnector);
  registerConnector(genericHttpConnector);
}

registerBuiltins();

export * from './types.js';
export * from './connectorRegistry.js';
export { connectorInstanceService } from './connectorInstanceService.js';
export { connectorToolBridge } from './connectorToolBridge.js';
