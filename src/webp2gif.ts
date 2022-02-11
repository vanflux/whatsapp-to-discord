import { spawn } from "child_process";

export default class Webp2Gif {
  public static async checkMagickExists() {
    return new Promise<boolean>(resolve => {
      const proc = spawn('magick');
      proc.on('close', () => resolve(true));
      proc.on('error', () => resolve(false));
    });
  }

  public static async convert(buffer: Buffer) {
    return new Promise<Buffer|undefined>(resolve => {
      const buffers: Buffer[] = [];
      const proc = spawn('magick', ['mogrify', '-format', 'gif', '-']);
      proc.on('close', () => resolve(Buffer.concat(buffers)));
      proc.stdin.write(buffer);
      proc.stdin.end();
      proc.stdout.on('data', buffer => buffers.push(buffer));
      proc.stderr.on('data', ()=>{});
    });
  }
}
