import fetch from "cross-fetch";
import { Message as DcMessage } from "discord.js";
import EventEmitter from "events";
import { WaSendMessagePayload } from "../../bots/whatsapp";
import FileConverter from "../../converters/file-converter";
import { bufferToMp3DataUrl } from "../../functions";

interface SendMessageHandlerEvents {
  'send message request': (payload: WaSendMessagePayload) => void;
}

declare interface SendMessageHandler {
  on<U extends keyof SendMessageHandlerEvents>(
    event: U, listener: SendMessageHandlerEvents[U]
  ): this;
  emit<U extends keyof SendMessageHandlerEvents>(
    event: U, ...args: Parameters<SendMessageHandlerEvents[U]>
  ): boolean;
}

class SendMessageHandler extends EventEmitter {

  public async handle(dcMessage: DcMessage) {
    let textSent = false;

    for (let attachment of dcMessage.attachments.values()) {
      const { contentType, url } = attachment;
      const [type, ext] = contentType?.split('/') || [];
      const fileName = url.split('/').pop()!;
      console.log('Handling discord attachment to whatsapp', type, ext, url, fileName);
      switch (type) {
        case 'image': {
          this.emit('send message request', { type: 'image', fileName, imageUrl: url, caption: textSent ? '' : dcMessage.content });
          textSent = true;
          break;
        }
        case 'audio': {
          const inputBuffer = Buffer.from(await (await fetch(url)).arrayBuffer());
          const buf = await FileConverter.convert(inputBuffer!, ext, 'mp3');
          const dataUrl = bufferToMp3DataUrl(buf!);
          this.emit('send message request', { type: 'audio', file: dataUrl });
          break;
        }
        default: {
          this.emit('send message request', { type: 'file_url', url, fileName, caption: textSent ? '' : dcMessage.content });
          textSent = true;
          break;
        }
      }
    }
    if (!textSent) this.emit('send message request', { type: 'text', text: dcMessage.content });
  }
}

export default SendMessageHandler;
