import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { StatusBarComponent } from './components/status-bar/status-bar.component';
import { AudioService } from './services/audio.service';
import { SettingsService } from './services/settings.service';
import { filter } from 'rxjs/operators';

@Component({
  imports: [RouterModule, StatusBarComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected title = 'client';
  private audioService = inject(AudioService);
  private settingsService = inject(SettingsService);
  private router = inject(Router);
  private setupCheckCompleted = false;

  ngOnInit(): void {
    // Check setup status on app initialization
    this.checkSetupStatus();

    // Also check on navigation to ensure user completes setup
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.checkSetupStatus();
      });
  }

  private checkSetupStatus(): void {
    // Don't check if we're already on the setup page or setup check is completed
    const currentPath = this.router.url;
    if (currentPath.startsWith('/setup') || this.setupCheckCompleted) {
      return;
    }

    // Get setup completion status
    this.settingsService.getAllSettings().subscribe({
      next: (settings) => {
        const setupSetting = settings.find((s) => s.name === 'setupCompleted');
        const isSetupCompleted = setupSetting?.value === 'true';

        if (!isSetupCompleted) {
          // Redirect to setup wizard
          this.router.navigate(['/setup']);
        } else {
          this.setupCheckCompleted = true;
        }
      },
      error: (error) => {
        console.error('Error checking setup status:', error);
        // On error, assume setup is needed
        if (!currentPath.startsWith('/setup')) {
          this.router.navigate(['/setup']);
        }
      },
    });
  }
}
