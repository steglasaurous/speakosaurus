import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { StatusBarComponent } from './components/status-bar/status-bar.component';
import { AudioService } from './services/audio.service';

@Component({
  imports: [RouterModule, StatusBarComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected title = 'client';
  private audioService = inject(AudioService);
}
