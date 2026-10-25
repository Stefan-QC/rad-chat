import type { Message, Profile } from '../../core/types';
import type { Services } from '../../services/Services';

interface GameHandle {
  exit: () => void;
}

/** Verbindt het spel (game.js) met de database en Realtime: wereld, blokken, spelers en chat. */
export class CraftSession {
  private readonly bus = new EventTarget();
  private readonly stops: Array<() => void> = [];
  private handle: GameHandle | null = null;
  private sessionId: number | null = null;
  private stopped = false;

  constructor(
    private readonly services: Services,
    private readonly me: Profile,
    private readonly chatChannelId: string,
  ) {}

  async start(onExit: () => void): Promise<void> {
    const { craft, craftNetwork, activity, messages, profiles } = this.services;
    const names = new Map<string, string>(); // user id -> weergavenaam
    (await profiles.listAll()).forEach(p => names.set(p.id, p.display_name));
    if (this.stopped) return;

    craftNetwork.join(this.me.display_name);
    this.stops.push(
      craftNetwork.on('players', players => this.dispatch('players', players)),
      craftNetwork.on('block', block => this.dispatch('block', block)),
      messages.subscribe(this.chatChannelId, {
        onInsert: (message: Message) => this.dispatch('message', { type: 'chat', name: names.get(message.user_id) ?? '?', text: message.body }),
        onUpdate: () => undefined,
      }),
    );
    this.sessionId = await activity.start('craft').catch(() => null);

    // Het spel (en three.js) wordt pas geladen als iemand echt gaat spelen.
    const { startGame } = await import('../../craft/game.js');
    const handle = await startGame({
      name: this.me.display_name,
      bus: this.bus,
      sendChat: (text: string) => messages.send(this.chatChannelId, text),
      onExit: () => {
        const closedByUser = !this.stopped;
        this.stop();
        if (closedByUser) onExit();
      },
      net: {
        loadWorld: () => craft.loadWorld(),
        sendBlock: (x: number, y: number, z: number, id: number) => {
          craftNetwork.sendBlock({ x, y, z, id });
          void craft.setBlock(x, y, z, id);
        },
        sendPosition: (position: Parameters<typeof craftNetwork.sendPosition>[0]) => craftNetwork.sendPosition(position),
        leave: () => craftNetwork.leave(this.me.display_name),
      },
    });
    this.handle = handle ?? null;
    if (this.stopped) this.handle?.exit();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.stops.splice(0).forEach(stop => stop());
    this.services.craftNetwork.leave(this.me.display_name);
    if (this.sessionId !== null) void this.services.activity.end(this.sessionId);
    this.handle?.exit();
  }

  private dispatch(type: string, detail: unknown): void {
    this.bus.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
