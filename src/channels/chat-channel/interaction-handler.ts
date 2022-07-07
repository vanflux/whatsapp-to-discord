import { ButtonInteraction, Interaction, MessageAttachment, MessageEmbed } from "discord.js";
import EventEmitter from "events";
import { extension } from "mime-types";
import AudioManager from "../../services/audio-manager";
import Whatsapp, { WaSendMessagePayload } from "../../bots/whatsapp";
import Webp2Gif from "../../converters/webp-2-gif";
import { bufferToMp3DataUrl, nameFromContact, nowDateStr, pictureFromContact } from "../../functions";
import DcLocation from "./dc-location";
import { BirthdayService } from "../../services/birthday-service";

interface InteractionHandlerEvents {
  'send message request': (opts: WaSendMessagePayload) => void;
}

declare interface InteractionHandler {
  on<U extends keyof InteractionHandlerEvents>(
    event: U, listener: InteractionHandlerEvents[U]
  ): this;
  emit<U extends keyof InteractionHandlerEvents>(
    event: U, ...args: Parameters<InteractionHandlerEvents[U]>
  ): boolean;
}

class InteractionHandler extends EventEmitter {
  private dcLocation: DcLocation;
  private waChatId: string;
  private dcMsgIdToWaMsgId: (waMsgId: string) => string|undefined;

  constructor(dcMsgIdToWaMsgId: (waMsgId: string) => string|undefined, waChatId: string) {
    super();
    this.dcLocation = new DcLocation();
    this.waChatId = waChatId;
    this.dcMsgIdToWaMsgId = dcMsgIdToWaMsgId;
  }

  public async handle(interaction: Interaction) {
    if (interaction.isButton()) {
      const buttonInteraction = interaction as ButtonInteraction;
      const type = buttonInteraction.customId;
      const messageId = this.dcMsgIdToWaMsgId(buttonInteraction.message.id);
      console.log(`[Interaction Handler] message.id=${buttonInteraction.message.id}, waMessageId=${messageId}`);
      await buttonInteraction.deferUpdate();
      const waMessage = await Whatsapp.getMessageById(messageId!);
      if (waMessage) {
        const profilePictureUrl = pictureFromContact(waMessage.sender);
        const senderName = nameFromContact(waMessage.sender);
        console.log(`[Interaction Handler] type=${type}`);
        switch(type) {
          case 'load_animated_sticker': {
            console.log('[Interaction Handler] Load animated sticker request');
            const fileBuffer = await Whatsapp.decryptMedia(waMessage);
            const fileName = `Sticker_Received_${nowDateStr()}.gif`;
            const buf = await Webp2Gif.convert(fileBuffer!);
            const attachment = new MessageAttachment(buf!, fileName);
            const embed = new MessageEmbed();
            embed.setAuthor({ iconURL: profilePictureUrl, name: senderName });
            embed.setColor(waMessage.fromMe ? 'GREEN' : 'GREY');
            embed.setImage(`attachment://${fileName}`);
            await buttonInteraction.editReply({ embeds: [embed], files: [attachment], components: [] });
            console.log('[Interaction Handler] Load animated sticker completed');
            break;
          }
          case 'load_video': {
            console.log('[Interaction Handler] Load video request');
            if (waMessage.mimetype) {
              const fileBuffer = await Whatsapp.decryptMedia(waMessage);
              const fileExtension = extension(waMessage.mimetype);
              const fileName = `Video_Received_${nowDateStr()}.${fileExtension}`;
              const attachment = new MessageAttachment(fileBuffer!, fileName);
              await buttonInteraction.editReply({ embeds: [], files: [attachment], components: [] });
            }
            console.log('[Interaction Handler] Load video completed');
            break;
          }
          case 'load_document': {
            console.log('[Interaction Handler] Load document request');
            if (waMessage.mimetype) {
              const fileBuffer = await Whatsapp.decryptMedia(waMessage);
              const fileName = buttonInteraction.message?.embeds[0]?.fields?.find(field => field.name === 'Filename')?.value || 'unknown';
              const attachment = new MessageAttachment(fileBuffer!, fileName);
              await buttonInteraction.editReply({ embeds: [], files: [attachment], components: [] });
            }
            console.log('[Interaction Handler] Load document completed');
            break;
          }
          case 'show_location': {
            console.log('[Interaction Handler] Show location request');
            const input = this.dcLocation.extractInputData(waMessage, buttonInteraction);
            const payload = await this.dcLocation.build(input);
            await buttonInteraction.editReply(payload);
            console.log('[Interaction Handler] Show location completed');
            break;
          }
          case 'location_zoom_out': {
            console.log('[Interaction Handler] Zoom out location request');
            const {lat, lng, zoom} = this.dcLocation.extractInputData(waMessage, buttonInteraction);
            const payload = await this.dcLocation.build({ lat, lng, zoom: zoom-1 });
            await buttonInteraction.editReply(payload);
            console.log('[Interaction Handler] Zoom out location completed');
            break;
          }
          case 'location_zoom_in': {
            console.log('[Interaction Handler] Zoom in location request');
            const {lat, lng, zoom} = this.dcLocation.extractInputData(waMessage, buttonInteraction);
            const payload = await this.dcLocation.build({ lat, lng, zoom: zoom+1 });
            await buttonInteraction.editReply(payload);
            console.log('[Interaction Handler] Zoom in location completed');
            break;
          }
        }
      } else {
        await buttonInteraction.editReply('WA Message not found');
      }
    } else if (interaction.isCommand()) {
      if (interaction.commandName === 'voice') {
        const mp3AudioBuffer = AudioManager.shiftNextAudioBuffer();
        if (!mp3AudioBuffer) return interaction.reply('Audios not found');
        interaction.reply('Success!');
        const audioBase64 = bufferToMp3DataUrl(mp3AudioBuffer);
        this.emit('send message request', { type: 'voice', file: audioBase64 });
      } else if (interaction.commandName === 'birthday') {
        switch (interaction.options.getSubcommand()) {
          case 'set':
            const dateStr = interaction.options.getString('date');
            if (!dateStr?.match(/^\d\d?\/\d\d?$/)) {
              interaction.reply('Invalid date, use DD/MM format');
            } else {
              const day = Number(dateStr.split('/')[0]);
              const month = Number(dateStr.split('/')[1]);
              const name = interaction.options.getString('name')!;
              const message = interaction.options.getString('message')!;
              BirthdayService.addBirthday({ waChatId: this.waChatId, day, month, name, message });
              interaction.reply(`Birthday of "${name}" registered at ${day}/${month}!`);
            }
            break;
          case 'delete':
            const name = interaction.options.getString('name')!;
            if (BirthdayService.deleteBirthday(this.waChatId, name)) {
              interaction.reply(`Birthday of "${name}" deleted!`);
            } else {
              interaction.reply(`Birthday of "${name}" already doesnt exist!`);
            }
            break;
          case 'list':
            const birthdays = BirthdayService.getBirthdays(this.waChatId);
            const description = birthdays.map((birthday, index) => {
              return `${index+1}. ${birthday.name} on ${birthday.day}/${birthday.month}`;
            }).join('\n');
            const embed = new MessageEmbed()
            .setTitle('Birthday List')
            .setDescription(description);
            interaction.reply({ embeds: [embed] });
            break;
        }
      }
    }
  }
}

export default InteractionHandler;
