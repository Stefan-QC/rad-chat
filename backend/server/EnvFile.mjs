import fs from 'node:fs';

/** Leest een .env-bestand zonder extra pakketten. */
export class EnvFile {
  /** Geeft de waarden uit het bestand terug, of een leeg object als het bestand niet bestaat. */
  static read(file) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return {};
    }
    const values = {};
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (match) values[match[1]] = EnvFile.unquote(match[2]);
    }
    return values;
  }

  static unquote(value) {
    const quoted = /^(["'])(.*)\1$/.exec(value);
    return quoted ? quoted[2] : value;
  }
}
