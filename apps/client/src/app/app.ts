import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { StatusBarComponent } from './components/status-bar/status-bar.component';

@Component({
  imports: [RouterModule, StatusBarComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected title = 'client';
}
