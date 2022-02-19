import { VoiceChannel, VoiceState } from "discord.js";
import Discord from "../bots/discord";
import EventEmitter from "events";
import { AudioReceiveStream, EndBehaviorType, joinVoiceChannel, VoiceConnection } from "@discordjs/voice";
import { WritableStreamBuffer } from "stream-buffers";
import { pipeline } from "stream";
import FileConverter from "../converters/file-converter";
import { opus } from "prism-media";
import AudioManager from "../audio-manager";
import PersistentChannel from "../persistent-channel";

const channelName = '🔉audio🔉';
const channelTopic = 'Audio Channel';

export interface AudioData {
  channelId?: string;
};

export default class AudioChannel extends EventEmitter {
  private guildId: string;
  private audioData: AudioData;
  private persistentChannel: PersistentChannel<VoiceChannel>;
  private connection: VoiceConnection|undefined;
  private opusStream: AudioReceiveStream|undefined;
  private ready = false;
  
  private get channel() { return this.persistentChannel.getChannel() };
  private get channelId() { return this.persistentChannel.getChannelId() };

  constructor(guildId: string, audioData: AudioData) {
    super();
    this.guildId = guildId;
    this.audioData = audioData;
    this.persistentChannel = new PersistentChannel(this.guildId, this.audioData.channelId, () => ({ channelName, options: { type: 'GUILD_VOICE', topic: channelTopic } }));
    this.persistentChannel.on('channel changed', (newChannelId: string) => this.handleChannelChanged(newChannelId));
  }

  public async setup() {
    if (this.ready) return true;
    if (!await this.persistentChannel.setup()) return false;

    await Discord.on('voiceStateUpdate', (oldVoiceState, newVoiceState) => this.handleVoiceStateUpdate(oldVoiceState, newVoiceState));

    this.ready = true;
    this.emit('ready');
    return true;
  }
  
  private handleChannelChanged(newChannelId: string) {
    this.audioData.channelId = newChannelId;
    this.emit('data changed', this.audioData);
  }

  private async handleVoiceStateUpdate(oldVoiceState: VoiceState, newVoiceState: VoiceState) {
    if (newVoiceState.guild.id !== this.guildId) return;
    if (newVoiceState.channelId === this.channelId) {
      if (!this.connection) {
        const userId = newVoiceState.member!.id;
        const guild = this.channel!.guild;
        if (!userId) return;

        this.connection = joinVoiceChannel({
          channelId: this.channelId!,
          guildId: this.guildId,
          adapterCreator: guild.voiceAdapterCreator,
        });

        this.opusStream = this.connection.receiver.subscribe(userId, {
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
          console.log('Audio added');
          AudioManager.addAudio(mp3Buffer);
        });
        
        const cb = (err: NodeJS.ErrnoException | null) => err && console.log(err);

        pipeline(this.opusStream, decoder, wsb, cb);
      }
    } else {
      if (this.connection) {
        this.opusStream?.emit('end');
        this.opusStream?.destroy();
        this.connection.disconnect();
        this.connection.destroy();
        this.connection = undefined;
        this.opusStream = undefined;
      }
    }
  }
}
