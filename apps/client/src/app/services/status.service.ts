import { inject, Injectable, OnDestroy, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { API_URL } from '../constants';

export interface Status {
  streamerBotConnected: boolean;
  audioQueueSize: number;
  pendingMessages: number;
  mode: string;
}

@Injectable({
  providedIn: 'root',
})
export class StatusService implements OnDestroy {
  private apiUrl = API_URL;
  private http = inject(HttpClient);
  private ngZone = inject(NgZone);
  private statusSubject = new BehaviorSubject<Status>({
    streamerBotConnected: false,
    audioQueueSize: 0,
    pendingMessages: 0,
    mode: 'trigger',
  });
  private eventSource: EventSource | null = null;

  public readonly status$ = this.statusSubject.asObservable();

  constructor() {
    this.connectToStatusStream();
  }

  /**
   * Get current status (from BehaviorSubject)
   */
  getStatus(): Observable<Status> {
    return this.status$;
  }

  /**
   * Get status via REST API (for one-time queries)
   */
  getStatusOnce(): Observable<Status> {
    return this.http.get<Status>(`${this.apiUrl}/status`);
  }

  /**
   * Connect to SSE stream and update status subject
   */
  private connectToStatusStream(): void {
    try {
      this.eventSource = new EventSource(`${this.apiUrl}/status/stream`);

      this.eventSource.onmessage = (event) => {
        try {
          const status: Status = JSON.parse(event.data);
          console.log('Received status update:', status);
          // Run inside Angular zone to trigger change detection
          this.ngZone.run(() => {
            this.statusSubject.next(status);
          });
        } catch (error) {
          console.error('Error parsing status update:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        // EventSource will automatically attempt to reconnect
        // But we can also implement a manual retry with delay if needed
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          // Connection closed, retry after 3 seconds
          setTimeout(() => {
            if (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED) {
              this.connectToStatusStream();
            }
          }, 3000);
        }
      };
    } catch (error) {
      console.error('Failed to create EventSource:', error);
      // Retry after 3 seconds
      setTimeout(() => {
        this.connectToStatusStream();
      }, 3000);
    }
  }

  /**
   * Cleanup (call this in ngOnDestroy if needed)
   */
  ngOnDestroy(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

