import { Message as DcMessage, Channel, VoiceChannel } from "discord.js";
import Discord from "../bots/discord";
import EventEmitter from "events";
import { AudioReceiveStream, EndBehaviorType, joinVoiceChannel, VoiceConnection } from "@discordjs/voice";
import { WritableStreamBuffer } from "stream-buffers";
import { pipeline } from "stream";
import FileConverter from "../converters/file-converter";
import { opus } from "prism-media";
import Whatsapp from "../bots/whatsapp";

const channelName = '🔉audio🔉';
const channelTopic = 'Qr Code Channel';

export interface AudioData {
  channelId?: string;
};

export default class AudioChannel extends EventEmitter {
  private guildId: string;
  private channel: VoiceChannel|undefined;
  private audioData: AudioData;
  private ready = false;
  
  private get channelId() { return this.audioData.channelId };
  
  private set channelId(value) { this.audioData.channelId = value };

  constructor(guildId: string, qrData: AudioData) {
    super();
    this.guildId = guildId;
    this.audioData = qrData;
  }

  public async setup() {
    if (this.ready) return;

    if (this.channelId) await this.loadExistentChannel();
    if (!this.channelId) await this.createNewChannel();

    if (this.channelId) {
      let connection: VoiceConnection|undefined;
      let opusStream: AudioReceiveStream|undefined;
      await Discord.on('channelDelete', channel => this.handleDiscordChannelDelete(channel));
      await Discord.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {
        if (newVoiceState.guild.id !== this.guildId) return;
        if (newVoiceState.channelId === this.channelId) {
          if (!connection) {
            const userId = newVoiceState.member!.id;
            const guild = this.channel!.guild;
            if (!userId) return;

            connection = joinVoiceChannel({
              channelId: this.channelId!,
              guildId: this.guildId,
              adapterCreator: guild.voiceAdapterCreator,
            });

            opusStream = connection.receiver.subscribe(userId, {
              end: { behavior: EndBehaviorType.Manual },
            });

            const channels = 2;
            const rate = 48000;
            const frameSize = 960;
            
            const decoder = new opus.Decoder({channels, rate, frameSize});
            
            const wsb = new WritableStreamBuffer();
            wsb.on('close', async () => {
              const pcmBuffer = wsb.getContents();
              if (!pcmBuffer) return;
              console.log('Received PCB Buffer');
              const mp3Buffer = await FileConverter.convert(pcmBuffer, 's16le', 'mp3', ['-ar', `${rate}`, '-ac', `${channels}`], []);
              if (!mp3Buffer) return;
              const uri = `data:audio/mp3;base64,${mp3Buffer.toString('base64')}`;
              //await Whatsapp.sendVoice('XXXXXXXXXXX', uri);
              //console.log('Audio sent');
            });
            
            pipeline(opusStream, decoder, wsb, console.log);
          }
        } else {
          if (connection) {
            opusStream?.destroy();
            connection.disconnect();
            connection.destroy();
            connection = undefined;
            opusStream = undefined;
          }
        }
      });

      this.ready = true;
      this.emit('ready');
    } else {
      this.emit('setup error');
    }
  }

  public isReady() {
    return this.ready;
  }

  public getChannelId() {
    return this.channelId;
  }
  
  public getChannel() {
    return this.channel;
  }

  public getQrData() {
    return this.audioData;
  }

  private async setChannel(channel: VoiceChannel) {
    const changed = this.channel != null;
    this.channel = channel;
    this.channelId = channel.id;
    if (changed) this.emit('channel changed', channel);
    this.emit('data changed', this.audioData);
  }

  private async loadExistentChannel() {
    const existentChannel = await Discord.getChannel(this.guildId, this.channelId!);
    if (existentChannel?.type === 'GUILD_VOICE') {
      this.setChannel(existentChannel);
    } else {
      this.channelId = undefined;
      this.emit('data changed', this.audioData);
    }
  }

  private async createNewChannel() {
    const channelCreated = await Discord.createChannel(this.guildId, channelName, { type: 'GUILD_VOICE', topic: channelTopic }) as VoiceChannel;
    if (channelCreated) {
      this.emit('data changed', this.audioData);
      this.setChannel(channelCreated);
    }
  }

  private async handleDiscordChannelDelete(channel: Channel) {
    if (channel.id !== this.channelId) return;
    await this.createNewChannel();
  }
}
