import { LoggerService } from '@nestjs/common';
import { app } from 'electron';
import log from 'electron-log/main';
import { join } from 'path';
import { inspect } from 'util';

/**
 * Configure electron-log for dual console + file output.
 * Must run after the Electron app name is set so userData resolves correctly.
 */
export function configureAppLogger(isDevelopment: boolean): void {
  log.transports.file.resolvePathFn = () =>
    join(app.getPath('userData'), 'logs', 'main.log');

  const level = isDevelopment ? 'debug' : 'info';
  log.transports.file.level = level;
  log.transports.console.level = level;
}

export { log as appLog };

function formatMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof Error) {
    return message.stack ?? message.message;
  }
  return inspect(message, { depth: 5, breakLength: Infinity });
}

/**
 * NestJS LoggerService backed by electron-log (console + userData/logs/main.log).
 */
export class ElectronLogNestLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void {
    log.info(this.formatArgs(message, optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    const { text, stack } = this.formatErrorArgs(message, optionalParams);
    if (stack) {
      log.error(text, '\n' + stack);
    } else {
      log.error(text);
    }
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    log.warn(this.formatArgs(message, optionalParams));
  }

  debug?(message: unknown, ...optionalParams: unknown[]): void {
    log.debug(this.formatArgs(message, optionalParams));
  }

  verbose?(message: unknown, ...optionalParams: unknown[]): void {
    log.verbose(this.formatArgs(message, optionalParams));
  }

  fatal?(message: unknown, ...optionalParams: unknown[]): void {
    log.error(this.formatArgs(message, optionalParams));
  }

  /**
   * Nest convention: last string argument is usually the logger context
   * (class/service name). Remaining args are part of the message.
   */
  private formatArgs(message: unknown, optionalParams: unknown[]): string {
    const parts: unknown[] = [message, ...optionalParams];
    const context = this.takeContext(parts);
    const body = parts.map(formatMessage).join(' ');
    return context ? `[${context}] ${body}` : body;
  }

  private formatErrorArgs(
    message: unknown,
    optionalParams: unknown[],
  ): { text: string; stack?: string } {
    const parts: unknown[] = [message, ...optionalParams];
    const context = this.takeContext(parts);

    // Nest: error(message, stack?, context?) — stack is a multi-line string
    let stack: string | undefined;
    if (
      parts.length >= 2 &&
      typeof parts[1] === 'string' &&
      (parts[1] as string).includes('\n')
    ) {
      stack = parts.splice(1, 1)[0] as string;
    }

    const body = parts.map(formatMessage).join(' ');
    return {
      text: context ? `[${context}] ${body}` : body,
      stack,
    };
  }

  private takeContext(parts: unknown[]): string | undefined {
    if (parts.length < 2) {
      return undefined;
    }
    const last = parts[parts.length - 1];
    if (
      typeof last === 'string' &&
      !last.includes('\n') &&
      last.length < 200
    ) {
      parts.pop();
      return last;
    }
    return undefined;
  }
}
