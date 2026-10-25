import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Gegevens over het netwerk en het certificaat, zodat collega's weten welk adres ze moeten openen. */
export class Network {
  /** De IPv4-adressen waarop collega's in hetzelfde netwerk de app kunnen bereiken. */
  static lanAddresses() {
    return Object.values(os.networkInterfaces())
      .flat()
      .filter(address => address && address.family === 'IPv4' && !address.internal)
      .map(address => address.address);
  }

  /** Geeft sleutel en certificaat uit de certs-map, of null als er geen zijn (dan werkt de host met http). */
  static loadCertificate(dir) {
    try {
      return { key: fs.readFileSync(path.join(dir, 'key.pem')), cert: fs.readFileSync(path.join(dir, 'cert.pem')) };
    } catch {
      return null;
    }
  }
}
