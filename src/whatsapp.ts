import { Client, create } from "@open-wa/wa-automate";

export default class Whatsapp {
  public static client: Client;

  public static async connect() {
    this.client = await create({
      sessionId: "OWN_SESS",
      multiDevice: true, //required to enable multiDevice support
      authTimeout: 60, //wait only 60 seconds to get a connection with the host account device
      blockCrashLogs: true,
      disableSpins: true,
      logConsole: false,
      popup: true,
      qrTimeout: 0, //0 means it will wait forever for you to scan the qr code
      
      headless: true,
      ensureHeadfulIntegrity: false,
      useChrome: true,
    });
  }

  public static async getAllChats() {
    return await this.client.getAllChats();
  }
  
  public static async getChatById(id: string) {
    return await this.client.getChatById(id as any);
  }
  
  public static async sendTextMessage(chatId: string, message: string) {
    return await this.client.sendText(chatId as any, message);
  }
  
  public static async sendImageMessageByUrl(chatId: string, fileName: string, imageUrl: string, caption='') {
    return await this.client.sendImage(chatId as any, imageUrl, fileName, caption);
  }

  public static async getLastMessageTimestampByChatId(chatId: string) {
    const timestamps = await this.client.getLastMsgTimestamps();
    const timestamp = timestamps.find(t => t.id === chatId);
    if (timestamp == null) return;
    return timestamp.t;
  }

  public static async getMessagesAfterTimestampByChatId(chatId: string, timestamp: number) {
    const earlierMessages = await this.client.loadEarlierMessages(chatId as any);
    const loadedMessages = await this.client.getAllMessagesInChat(chatId as any, true, true);
    const messages = earlierMessages.slice();
    const earlierIdsSet = new Set(earlierMessages.map(x=>x.id));
    loadedMessages.forEach(message => !earlierIdsSet.has(message.id) && messages.push(message));
    return messages.filter(message => message.t * 1000 > timestamp);
  }

  public static async getMessageById(messageId: string) {
    return await this.client.getMessageById(messageId as any);
  }

  public static async getLastMessagesByChatId(chatId: string, count: number) {
    const earlierMessages = await this.client.loadEarlierMessages(chatId as any);
    const loadedMessages = await this.client.getAllMessagesInChat(chatId as any, true, true);
    const messages = earlierMessages.slice();
    const earlierIdsSet = new Set(earlierMessages.map(x=>x.id));
    loadedMessages.forEach(message => !earlierIdsSet.has(message.id) && messages.push(message));
    if (messages.length <= count) return messages;
    return messages.slice(-count);
  }
}
