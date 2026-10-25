import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 2000;

/** Start de Python-API als kindproces van de host en start hem opnieuw als hij crasht. */
export class ApiProcess {
  constructor(config, log = console) {
    this.config = config;
    this.log = log;
    this.child = null;
    this.restarts = 0;
    this.stopping = false;
  }

  /** Het Python van de virtuele omgeving die `npm run setup` aanmaakt. */
  pythonPath() {
    const venv = path.join(this.config.apiDir, '.venv');
    const candidates = [path.join(venv, 'Scripts', 'python.exe'), path.join(venv, 'bin', 'python')];
    return candidates.find(file => fs.existsSync(file)) ?? null;
  }

  start() {
    const python = this.pythonPath();
    if (!python) {
      this.log.warn('[api] Python environment not found, the API is not started. Run "npm run setup" once.');
      return false;
    }
    this.child = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(this.config.apiPort)], {
      cwd: this.config.apiDir,
      env: this.config.apiEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child.stdout.on('data', data => this.print(data));
    this.child.stderr.on('data', data => this.print(data));
    this.child.on('exit', code => this.onExit(code));
    return true;
  }

  print(data) {
    for (const line of String(data).split(/\r?\n/)) if (line.trim()) this.log.log(`[api] ${line}`);
  }

  onExit(code) {
    this.child = null;
    if (this.stopping) return;
    if (this.restarts >= MAX_RESTARTS) {
      this.log.error(`[api] stopped with code ${code} and is not restarted again; check the messages above.`);
      return;
    }
    this.restarts += 1;
    this.log.warn(`[api] stopped with code ${code}, restarting (${this.restarts}/${MAX_RESTARTS})`);
    setTimeout(() => { if (!this.stopping) this.start(); }, RESTART_DELAY_MS);
  }

  stop() {
    this.stopping = true;
    this.child?.kill();
  }
}
