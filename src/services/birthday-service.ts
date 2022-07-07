import EventEmitter from "events";
import Whatsapp from "../bots/whatsapp";

export interface BirthdaysData {
  birthdays?: BirthdayData[],
}

export interface BirthdayData {
  waChatId: string;
  name: string;
  day: number;
  month: number;
  message: string;
  lastYearSent?: number;
}

export class BirthdayService {
  private static data: BirthdaysData;
  private static eventEmitter = new EventEmitter();
  private static timer: NodeJS.Timer;

  public static setData(data: BirthdaysData) {
    this.data = data;
    if (!this.data.birthdays) this.data.birthdays = [];
    
    clearInterval(this.timer);
    this.check();
    console.log('Starting birthday checker with interval', this.getCheckInterval());
    this.timer = setInterval(this.check.bind(this), this.getCheckInterval());
  }

  public static addBirthday(birthdayData: BirthdayData) {
    this.data.birthdays?.push(birthdayData);
    this.eventEmitter.emit('data changed');
  }

  public static deleteBirthday(waChatId: string, name: string) {
    const index = this.data.birthdays?.findIndex(x => x.waChatId === waChatId && x.name === name) ?? -1;
    if (index >= 0) {
      this.data.birthdays?.splice(index, 1);
      this.eventEmitter.emit('data changed');
      return true;
    } else {
      return false;
    }
  }

  public static getBirthdays(waChatId: string) {
    return this.data.birthdays?.filter(x => x.waChatId === waChatId) || [];
  }
  
  public static on(event: 'data changed', listener: () => void): void;
  public static on(event: any, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  private static check() {
    if (!this.data.birthdays) return;
    const today = this.getToday();
    if (!today) return;
    const year = this.getYear();
    console.log('Checking birthdays... today is', today.day, '/', today.month, '/', year, 'timezone', this.getTimeZone());
    for (const birthday of this.data.birthdays) {
      if (birthday.lastYearSent !== undefined && birthday.lastYearSent >= year) continue;
      const date = this.getDateOnCurrentYear(birthday.day, birthday.month);
      if (!date) continue;
      if (date.day === today.day && date.month === today.month) {
        console.log('Sending birthday to', birthday.name, 'on chat', birthday.waChatId, 'with message:', birthday.message);
        Whatsapp.sendMessage(birthday.waChatId, {
          type: 'text',
          text: birthday.message,
        });
        birthday.lastYearSent = year;
        this.eventEmitter.emit('data changed');
      }
    }
  }

  private static getToday() {
    return this.extractLocaleDateFromDate(new Date());
  }

  private static getDateOnCurrentYear(day: number, month: number) {
    return this.extractLocaleDateFromDate(new Date(this.getYear(), month-1, day));
  }

  private static extractLocaleDateFromDate(date: Date) {
    try {
      const [monthStr, dayStr] = date.toLocaleString('en-US', { timeZone: this.getTimeZone() }).split('/');
      return { day: Number(dayStr), month: Number(monthStr) };
    } catch (exc) {
      console.error('Birthday service error:', exc);
    }
  }

  private static getYear() {
    return new Date().getFullYear();
  }

  private static getTimeZone() {
    return process.env.TZ || 'America/New_York';
  }

  private static getCheckInterval() {
    const checkInterval = parseInt(process.env.BIRTHDAY_CHECK_INTERVAL || '');
    if (isNaN(checkInterval)) return 60000;
    return checkInterval;
  }
}
