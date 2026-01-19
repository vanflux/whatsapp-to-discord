import { Chat, Contact } from "@whiskeysockets/baileys";

export function nameFromChat(chat: Chat) {
  return chat.displayName ?? chat.name ?? chat.username ?? 'unknown';
}

export function pictureFromContact(contact: Contact) {
  return contact?.imgUrl;
}

export function nameFromContact(contact: Contact) {
  return contact.name ?? contact.verifiedName ?? contact.phoneNumber ?? 'unknown';
}

export function descriptionFromChat(chat: Chat) {
  // @ts-ignore
  return chat?.groupMetadata?.desc || '';
}

export function nowDateStr() {
  let date = new Date();
  return `${date.getHours()}_${date.getMinutes()}__${date.getDate()}_${date.getMonth()}_${date.getFullYear()}`
}

export function sanitizeChatName(name: string|undefined) {
  return name && name.length >= 1 ? (name.length > 100 ? name.substring(0, 100) : name) : 'unnamed';
}

export function sanitizeChatDescription(description: string|undefined) {
  return description ? (description.length > 1024 ? description.substring(0, 1024) : description) : '';
}

export function bufferToMp3DataUrl(audioBuffer: Buffer) {
  return `data:audio/mp3;base64,${audioBuffer.toString('base64')}`;
}

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
