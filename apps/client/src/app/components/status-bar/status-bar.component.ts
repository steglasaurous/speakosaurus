import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatusService, Status } from '../../services/status.service';
import { SettingsService } from '../../services/settings.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-status-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './status-bar.component.html',
  styleUrl: './status-bar.component.scss',
})
export class StatusBarComponent implements OnInit, OnDestroy {
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
}

