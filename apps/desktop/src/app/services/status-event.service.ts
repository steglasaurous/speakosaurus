import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { StatusResponse } from '../controllers/status.controller';

@Injectable()
export class StatusEventService {
  private logger = new Logger(StatusEventService.name);
  private statusSubject = new Subject<Partial<StatusResponse>>();

  /**
   * Observable that emits status updates
   * Services subscribe to this to broadcast changes
   */
  public readonly statusUpdates$ = this.statusSubject.asObservable();

  /**
   * Emit a partial status update
   * Only include the fields that changed
   */
  emitStatusUpdate(update: Partial<StatusResponse>): void {
    this.logger.log('Emitting status update', JSON.stringify(update));
    this.statusSubject.next(update);
  }

  /**
   * Emit a full status update
   */
  emitFullStatus(status: StatusResponse): void {
    this.logger.log('Emitting full status', JSON.stringify(status));
    this.statusSubject.next(status);
  }
}

