import { config } from '../config/config';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: any;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV !== 'production';
  private minLevel: LogLevel;

  constructor() {
    const level = config.logging.level as LogLevel || 'info';
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
    return levels.indexOf(level) <= levels.indexOf(this.minLevel);
  }

  private formatLog(entry: LogEntry): string {
    const { timestamp, level, message, context, data } = entry;
    const prefix = context ? `[${context}]` : '';
    return `${timestamp} ${level.toUpperCase()} ${prefix} ${message}${data ? ` ${JSON.stringify(data)}` : ''}`;
  }

  private log(level: LogLevel, message: string, context?: string, data?: any): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      data
    };

    const formattedLog = this.formatLog(entry);

    switch (level) {
      case 'error':
        console.error(formattedLog);
        break;
      case 'warn':
        console.warn(formattedLog);
        break;
      case 'info':
        if (this.isDevelopment) console.log(formattedLog);
        break;
      case 'debug':
        if (this.isDevelopment) console.debug(formattedLog);
        break;
    }
  }

  error(message: string, context?: string, data?: any): void {
    this.log('error', message, context, data);
  }

  warn(message: string, context?: string, data?: any): void {
    this.log('warn', message, context, data);
  }

  info(message: string, context?: string, data?: any): void {
    this.log('info', message, context, data);
  }

  debug(message: string, context?: string, data?: any): void {
    this.log('debug', message, context, data);
  }
}

export const logger = new Logger();
