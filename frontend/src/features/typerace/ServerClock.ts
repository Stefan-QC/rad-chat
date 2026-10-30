/** Houdt het verschil bij tussen de klok van deze computer en die van de server, zodat iedereen op hetzelfde moment begint. */
export class ServerClock {
  private offsetMs = 0;
  private bestRoundTrip = Infinity;

  /** Verwerkt een meting: de server meldde `serverNow` ergens tussen `sentAt` en `receivedAt`. */
  update(serverNow: number, sentAt: number, receivedAt: number): void {
    const roundTrip = Math.max(0, receivedAt - sentAt);
    const measured = serverNow - (sentAt + roundTrip / 2);
    if (roundTrip <= this.bestRoundTrip) {
      this.bestRoundTrip = roundTrip;
      this.offsetMs = measured;
    } else {
      // Een tragere meting is minder betrouwbaar: laat die maar licht meewegen.
      this.offsetMs += (measured - this.offsetMs) * 0.1;
    }
  }

  /** De huidige tijd van de server in milliseconden. */
  now(): number {
    return Date.now() + this.offsetMs;
  }

  get offset(): number {
    return this.offsetMs;
  }
}
