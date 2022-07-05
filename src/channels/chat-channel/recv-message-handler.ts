import { Message as WaMessage, MessageTypes } from "@open-wa/wa-automate";
import { MessageActionRow, MessageAttachment, MessageButton, MessageEmbed, MessageOptions, ReplyOptions } from "discord.js";
import EventEmitter from "events";
import { extension } from "mime-types";
import Whatsapp from "../../bots/whatsapp";
import FileConverter from "../../converters/file-converter";
import { nameFromContact, nowDateStr } from "../../functions";

interface RecvMessageHandlerEvents {
  'topic change request': (newTopic: string) => void;
  'name change request': (newTopic: string) => void;
  'send message request': (opts: {options: MessageOptions, waMsgId: string}) => void;
}

declare interface RecvMessageHandler {
  on<U extends keyof RecvMessageHandlerEvents>(
    event: U, listener: RecvMessageHandlerEvents[U]
  ): this;
  emit<U extends keyof RecvMessageHandlerEvents>(
    event: U, ...args: Parameters<RecvMessageHandlerEvents[U]>
  ): boolean;
}

class RecvMessageHandler extends EventEmitter {
  private waMsgIdToDcMsgId: (dcMsgId: string) => string|undefined;

  constructor(waMsgIdToDcMsgId: (dcMsgId: string) => string|undefined) {
    super();
    this.waMsgIdToDcMsgId = waMsgIdToDcMsgId;
  }

  async handle(waMessage: WaMessage) {
    const { chatId, sender, fromMe, text, t, type, mimetype, isAnimated, body, filename: rawFileName, quotedMsg } = waMessage;
    const senderName = nameFromContact(sender);

    const profilePictureUrl = sender?.profilePicThumbObj?.img;
    const fileFormat = mimetype && mimetype.includes('/') ? mimetype.split('/')[1].split(';')[0] : undefined;
    const fileExtension = mimetype ? extension(mimetype) : undefined;
    const hasFile = mimetype && fileFormat;
    const fileBuffer = hasFile ? await Whatsapp.decryptMedia(waMessage) : undefined;
    const fileSize = hasFile ? (fileBuffer ? fileBuffer.length : 0) : undefined;
    const fileIsOverLimit = hasFile ? fileSize! > 8 * 1000 * 1000 : false;

    const dcRefMessage = quotedMsg ? this.waMsgIdToDcMsgId(quotedMsg.id) : undefined;

    const embeds: MessageEmbed[] = [];
    const files: MessageAttachment[] = [];
    const components: MessageActionRow[] = [];
    const reply: ReplyOptions|undefined = dcRefMessage ? { messageReference: dcRefMessage } : undefined;

    const embed = new MessageEmbed();
    embed.setAuthor({ iconURL: profilePictureUrl, name: senderName });
    embed.setColor(fromMe ? 'GREEN' : 'GREY');
    switch (type) {
      case MessageTypes.TEXT: {
        embed.setDescription(text);
        embeds.push(embed);
        break;
      }
      case MessageTypes.AUDIO: {
        if (hasFile) {
          const fileName = `Audio_Received_${nowDateStr()}.mp3`;
          const buf = await FileConverter.convert(fileBuffer!, fileFormat, 'mp3');
          const attachment = new MessageAttachment(buf!, fileName);
          files.push(attachment);
        }
        break;
      }
      case MessageTypes.DOCUMENT: {
        const btn = new MessageButton({ customId: 'load_document', style: 'PRIMARY', label: 'Load file' });
        components.push(new MessageActionRow({ components: [btn] }));
        embed.setDescription(`[Document]`);
        embed.addField('Filename', rawFileName || 'unknown', true);
        embed.addField('Size', (fileSize! / 1000) + ' kB', true);
        embed.addField('Can send', fileIsOverLimit ? 'No, its over 8MB' : 'Yes', false);
        embeds.push(embed);
        break;
      }
      case MessageTypes.IMAGE: {
        if (hasFile) {
          const fileName = `Image_Received_${nowDateStr()}.${fileExtension}`;
          const attachment = new MessageAttachment(fileBuffer!, fileName);
          files.push(attachment);
          embed.setImage(`attachment://${fileName}`);
          embeds.push(embed);
        }
        embed.setDescription(text);
        if (embeds.length === 0 && text != null && text.length > 0) {
          embeds.push(embed);
        }
        break;
      }
      case MessageTypes.LOCATION: {
        const btn = new MessageButton({ customId: 'show_location', style: 'PRIMARY', label: 'Show Location' });
        components.push(new MessageActionRow({ components: [btn] }));
        const lat = parseFloat(waMessage.lat || '0');
        const lng = parseFloat(waMessage.lng || '0');
        embed.setDescription(`[Location]`);
        embed.addField('Lat', `${lat}`, true);
        embed.addField('Lng', `${lng}`, true);
        embed.addField('Maps', `https://www.google.com.br/maps/dir//${lat},${lng}/@${lat},${lng},17z`, false);
        embeds.push(embed);
        break;
      }
      case MessageTypes.STICKER: {
        if (hasFile) {
          if (isAnimated) {
            const btn = new MessageButton({ customId: 'load_animated_sticker', style: 'PRIMARY', label: 'Load sticker' });
            components.push(new MessageActionRow({ components: [btn] }));
            embed.setDescription('[Animated sticker]');
            embeds.push(embed);
          } else {
            const fileName = `Sticker_Received_${nowDateStr()}.${fileExtension}`;
            const attachment = new MessageAttachment(fileBuffer!, fileName);
            files.push(attachment);
            embed.setImage(`attachment://${fileName}`);
            embeds.push(embed);
          }
        }
        break;
      }
      case MessageTypes.VIDEO: {
        if (hasFile) {
          // @ts-ignore
          if (waMessage.isGif) {
            const fileName = `Gif_Received_${nowDateStr()}.gif`;
            const buf = await FileConverter.convert(fileBuffer!, fileFormat, 'gif');
            const attachment = new MessageAttachment(buf!, fileName);
            files.push(attachment);
            embed.setImage(`attachment://${fileName}`);
            embeds.push(embed);
          } else {
            const btn = new MessageButton({ customId: 'load_video', style: 'PRIMARY', label: 'Load video' });
            components.push(new MessageActionRow({ components: [btn] }));
            embed.setDescription('[Video]');
            embed.addField('Size', (fileSize! / 1000) + ' kB', true);
            embed.addField('Can send', fileIsOverLimit ? 'No, its over 8MB' : 'Yes', false);
            embeds.push(embed);
          }
        }
        embed.setDescription(text);
        if (embeds.length === 0 && text != null && text.length > 0) {
          embeds.push(embed);
        }
        break;
      }
      case MessageTypes.VOICE: {
        if (hasFile) {
          const fileName = `Voice_Received_${nowDateStr()}.mp3`;
          const buf = await FileConverter.convert(fileBuffer!, fileFormat, 'mp3');
          const attachment = new MessageAttachment(buf!, fileName);
          files.push(attachment);
        }
        break;
      }
      // @ts-ignore
      case 'gp2': { // Chat/group rename
        // @ts-ignore
        switch (waMessage.subtype) {
          case 'description':
            const rawTopic = body;
            this.emit('topic change request', rawTopic);
            embed.setDescription(`*Changed chat description to "${rawTopic}"*`);
            embeds.push(embed);
            break;
          case 'subject':
            const rawName = body;
            this.emit('name change request', rawName);
            embed.setDescription(`*Changed chat name to "${rawName}"*`);
            embeds.push(embed);
            break;
        }
        break;
      }
      default: {
        console.log('[Recv Message Handler] Unhandled WaMessage:', waMessage);
        embed.setDescription(`*Unhandled message, please, check your whatsapp*`);
        embed.addField('Type', String(waMessage.type));
        embeds.push(embed);
      }
    }

    this.emit('send message request', { options: { embeds, files, components, reply }, waMsgId: waMessage.id });
  }
}

export default RecvMessageHandler;
