import { spawn } from "child_process";

export default class AudioManipulation {
  public static async concat(mp3AudioBuffer: Buffer, mp3AudioUrl: string) {
    return new Promise<Buffer|undefined>(resolve => {
      const id = Math.floor(Math.random() * 1000000000);
      console.log(`[Audio Manipulation] Concat, id: ${id}`);
      const start = Date.now();
      
      const args = [
        '-f', 'mp3', '-i', 'pipe:',
        '-i', mp3AudioUrl,
        '-filter_complex', '[0:0][1:0]concat=n=2:v=0:a=1[out]', '-map', '[out]', '-f', 'mp3', 'pipe:1',
      ];
      const buffers: Buffer[] = [];
      const proc = spawn('ffmpeg', args);
      proc.on('close', () => {
        const end = Date.now();
        console.log(`[Audio Manipulation] Concat ended, id: ${id}, time(ms): ${end-start}`);
        resolve(Buffer.concat(buffers));
      });
      proc.stdout.on('data', buffer => buffers.push(buffer));
      proc.stderr.on('data', ()=>{});
      proc.stdin.write(mp3AudioBuffer);
      proc.stdin.end();
    });
  }
}
