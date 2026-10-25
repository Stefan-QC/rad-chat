/** Dunne laag om de meldingen van de browser (bureaubladmeldingen) veilig te gebruiken. */
export class BrowserNotifier {
  static isSupported(): boolean {
    return typeof Notification !== 'undefined';
  }

  static permission(): NotificationPermission | 'unsupported' {
    return BrowserNotifier.isSupported() ? Notification.permission : 'unsupported';
  }

  /** Moet vanuit een klik worden aangeroepen, anders weigert de browser de vraag. */
  static async request(): Promise<NotificationPermission | 'unsupported'> {
    if (!BrowserNotifier.isSupported()) return 'unsupported';
    return Notification.requestPermission();
  }

  /** Toont alleen een melding als het tabblad op de achtergrond staat en er toestemming is. */
  static notify(title: string, body: string, onClick?: () => void): void {
    if (!BrowserNotifier.isSupported() || Notification.permission !== 'granted' || !document.hidden) return;
    const notification = new Notification(title, { body: body.slice(0, 140), icon: '/favicon.svg' });
    notification.onclick = () => {
      window.focus();
      onClick?.();
      notification.close();
    };
  }
}
