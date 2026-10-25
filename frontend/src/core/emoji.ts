export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '🙏'];

export interface EmojiGroup {
  label: string;
  emojis: string[];
}

/** Een compacte, vaste emoji-set: genoeg voor reacties zonder een zware bibliotheek. */
export const EMOJI_GROUPS: EmojiGroup[] = [
  { label: 'Smileys', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😎', '🤓', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😴', '😪', '🤯', '😳', '🥳', '😭', '😢', '😤', '😡', '🥺', '😱'] },
  { label: 'Gestures', emojis: ['👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '👋', '🤞', '✌️', '🤟', '👌', '👀', '🧠', '💡', '🔥', '⭐', '✨', '💯', '✅', '❌', '⚠️', '❓', '❗'] },
  { label: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💖', '💕'] },
  { label: 'Work', emojis: ['🎉', '🚀', '🏆', '🥇', '📈', '📉', '📌', '📎', '📅', '🗓️', '⏰', '💻', '🛠️', '🐛', '🔒', '🔑', '☕', '🍕', '🍰', '🍺', '🎂', '🎁', '🌱', '🌞'] },
];

export const ALL_EMOJIS = EMOJI_GROUPS.flatMap(group => group.emojis);
