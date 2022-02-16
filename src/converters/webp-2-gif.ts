import { spawn } from "child_process";

export default class Webp2Gif {
  public static async checkMagickExists() {
    return new Promise<boolean>(resolve => {
      const proc = spawn('mogrify');
      proc.on('close', () => resolve(true));
      proc.on('error', () => resolve(false));
    });
  }

  public static async convert(buffer: Buffer) {
    return new Promise<Buffer|undefined>(resolve => {
      const id = Math.floor(Math.random() * 1000000000);
      console.log(`[Webp2Gif Converter] Convert, id: ${id}, in length: ${buffer.length}`);
      const start = Date.now();

      const buffers: Buffer[] = [];
      const proc = spawn('mogrify', ['-format', 'gif', '-']);
      proc.on('close', () => {
        const end = Date.now();
        console.log(`[Webp2Gif Converter] Conversion ended, id: ${id}, time(ms): ${end-start}`);
        
        resolve(Buffer.concat(buffers));
      });
      proc.stdout.on('data', buffer => buffers.push(buffer));
      proc.stderr.on('data', ()=>{});
      proc.stdin.write(buffer);
      proc.stdin.end();
    });
  }
}
