import { ChatId, ChatState, Client, create, decryptMedia, ev, Message, MessageId, MessageTypes } from "@open-wa/wa-automate";
import { sleep } from "../functions";

export type WaSendMessagePayload = {
  type: 'text';
  text: string;
} | {
  type: 'image';
  fileName: string;
  imageUrl: string;
  caption: string;
} | {
  type: 'voice';
  file: string;
  quotedMsgId?: string;
} | {
  type: 'file';
  file: string;
  fileName: string;
  caption: string;
  quotedMsgId?: string;
} | {
  type: 'file_url';
  url: string;
  fileName: string;
  caption: string;
  quotedMsgId?: string;
} | {
  type: 'audio';
  file: string;
  quotedMsgId?: string;
};

export default class Whatsapp {
  private static client: Client;
  private static ready = false;
  private static waitingReadyResolves: Function[] = [];

  public static async connect() {
    ev.setMaxListeners(0);
    this.client = await create({
      sessionId: "OWN_SESS",
      sessionDataPath: 'wa-session',
      multiDevice: true, //required to enable multiDevice support
      authTimeout: 60, //wait only 60 seconds to get a connection with the host account device
      blockCrashLogs: true,
      disableSpins: true,
      logConsole: false,
      popup: true,
      qrTimeout: 0, //0 means it will wait forever for you to scan the qr code
      headless: process.env.WA_HEADLESS === 'true' ? true : false,
      useChrome: false,
      useStealth: true,
      restartOnCrash: true,
      executablePath: process.env.WA_EXECUTABLE_PATH || undefined,
    });
    console.log('[Whatsapp] Client ready');
    this.ready = true;
    this.waitingReadyResolves.forEach(func=>func());
    this.waitingReadyResolves = [];
  }

  public static waitReady() {
    if (this.ready) return;
    return new Promise(resolve => this.waitingReadyResolves.push(resolve));
  }

  public static async onAnyMessage(fn: (message: Message) => Promise<void>): Promise<()=>any> {
    await this.waitReady();
    const listener = await this.client.onAnyMessage((...args) => fn(...args).catch(console.error));
    return () => typeof listener !== 'boolean' && listener.off();
  }
  
  public static async onChatState(fn: (chatState: ChatState) => Promise<void>): Promise<()=>any> {
    await this.waitReady();
    const listener = await this.client.onChatState((...args) => fn(...args).catch(console.error));
    return () => typeof listener !== 'boolean' && listener.off();
  }

  public static async getAllChats() {
    await this.waitReady();
    return await this.client.getAllChats();
  }
  
  public static async getChatById(id: string) {
    await this.waitReady();
    return await this.client.getChatById(id as any);
  }

  public static async getLastMessageTimestampByChatId(chatId: string) {
    await this.waitReady();
    const earlierMessages = await this.client.getAllMessagesInChat(chatId as any, true, true) || [];
    earlierMessages.sort((a,b)=>b.t-a.t);
    const t = earlierMessages?.[0]?.t;
    return t ? t * 1000 : undefined;
  }

  public static async getMessagesAfterTimestampByChatId(chatId: string, timestamp: number) {
    await this.waitReady();
    const earlierMessages = await this.client.loadEarlierMessages(chatId as any) || [];
    const loadedMessages = await this.client.getAllMessagesInChat(chatId as any, true, true) || [];
    const messages = earlierMessages.slice();
    const earlierIdsSet = new Set(earlierMessages.map(x=>x.id));
    loadedMessages.forEach(message => !earlierIdsSet.has(message.id) && messages.push(message));
    return messages.filter(message => message.t * 1000 > timestamp);
  }

  public static async getMessageById(messageId: string) {
    await this.waitReady();
    return await this.client.getMessageById(messageId as any) as Message;
  }

  public static async getLastMessagesByChatId(chatId: string, count: number) {
    await this.waitReady();
    const earlierMessages = await this.client.loadEarlierMessages(chatId as any);
    const loadedMessages = await this.client.getAllMessagesInChat(chatId as any, true, true);
    const messages = earlierMessages.slice();
    const earlierIdsSet = new Set(earlierMessages.map(x=>x.id));
    loadedMessages.forEach(message => !earlierIdsSet.has(message.id) && messages.push(message));
    if (messages.length <= count) return messages;
    return messages.slice(-count);
  }

  public static async decryptMedia(message: Message) {
    // If someone have the insiders license and wants to decrypt stale media.
    // I think the logic needs to be here.
    // https://docs.openwa.dev/pages/How%20to/decrypt-media.html
    return await decryptMedia(message);
  }
  
  public static async simulateTyping(chatId: string, on: boolean) {
    await this.waitReady();
    return await this.client.simulateTyping(chatId as any, on);
  }

  public static async sendMessage(chatId: string, payload: WaSendMessagePayload) {
    await this.waitReady();
    switch(payload.type) {
      case 'text': return await this.client.sendText(chatId as ChatId, payload.text);
      case 'image': return await this.client.sendImage(chatId as ChatId, payload.imageUrl, payload.fileName, payload.caption || '');
      case 'voice': return await this.client.sendPtt(chatId as ChatId, payload.file, payload.quotedMsgId as MessageId);
      case 'file': return await this.client.sendFile(chatId as ChatId, payload.file, payload.fileName, payload.caption, payload.quotedMsgId as MessageId);
      case 'file_url': return await this.client.sendFileFromUrl(chatId as ChatId, payload.url, payload.fileName, payload.caption, payload.quotedMsgId as MessageId);
      case 'audio': return await this.client.sendAudio(chatId as ChatId, payload.file, payload.quotedMsgId as MessageId);
    }
  }
}
