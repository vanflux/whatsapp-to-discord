import { Chat } from "@open-wa/wa-automate";

export function nameFromChat(chat: Chat) {
  return  (chat?.contact.formattedName.startsWith('+') ? chat?.contact.pushname : chat?.contact.formattedName)
          || chat.formattedTitle
          || chat.name
          || 'unknown';
}
