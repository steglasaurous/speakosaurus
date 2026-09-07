import { Component, EventEmitter, OnInit, OnDestroy, inject, Output } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { StatusService, Status } from '../../services/status.service';
import { SettingsService } from '../../services/settings.service';
import { ConnectionConfigService } from '../../services/connection-config.service';

@Component({
  selector: 'app-status-bar',
  standalone: true,
  imports: [],
  templateUrl: './status-bar.component.html',
  styleUrl: './status-bar.component.scss',
})
export class StatusBarComponent implements OnInit, OnDestroy {
  @Output() settingsRequested = new EventEmitter<void>();
  @Output() playgroundRequested = new EventEmitter<void>();

  status: Status = {
    streamerBotConnected: false,
    audioQueueSize: 0,
    pendingMessages: 0,
    mode: 'trigger',
  };

  modeOptions = ['trigger', 'off', 'always'];
  private statusSubscription?: Subscription;
  private modeChangeSubscription?: Subscription;
  private statusService = inject(StatusService);
  private settingsService = inject(SettingsService);
  private http = inject(HttpClient);
  private connection = inject(ConnectionConfigService);
  stopInProgress = false;

  ngOnInit() {
    // Subscribe to real-time status updates via SSE
    this.statusSubscription = this.statusService.status$.subscribe({
      next: (status) => {
        this.status = status;
      },
      error: (error) => {
        console.error('Error in status stream:', error);
      },
    });
  }

  ngOnDestroy() {
    this.statusSubscription?.unsubscribe();
    this.modeChangeSubscription?.unsubscribe();
  }

  onModeChange(newMode: string) {
    this.modeChangeSubscription = this.settingsService
      .updateSetting('mode', newMode)
      .subscribe({
        next: () => {
          this.status.mode = newMode;
        },
        error: (error) => {
          console.error('Error updating mode:', error);
        },
      });
  }

  onStopClicked(): void {
    if (this.stopInProgress) return;
    this.stopInProgress = true;

    this.http.post(`${this.connection.getApiUrl()}/speak/stop`, {}).subscribe({
      next: (result: { success?: boolean }) => {
        // Queue + playback are also reflected via SSE (audioQueueSize / pendingMessages).
        // We don't force UI state here beyond disabling the button momentarily.
        if (result?.success === false) {
          console.warn('Stop request returned success=false');
        }
      },
      error: (error) => {
        console.error('Failed to stop speech playback:', error);
        this.stopInProgress = false;
      },
      complete: () => {
        this.stopInProgress = false;
      },
    });
  }
}

