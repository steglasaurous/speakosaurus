import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UsersService, User, CustomIntro } from '../../services/users.service';
import { VoicesService, Voice } from '../../services/voices.service';
import { forkJoin } from 'rxjs';
import { VoiceSelectorComponent } from '../voice-selector/voice-selector.component';

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, VoiceSelectorComponent],
  templateUrl: './user-detail.component.html',
  styleUrl: './user-detail.component.scss',
})
export class UserDetailComponent implements OnInit {
  user: User | null = null;
  twitchUserId = '';

  // Voice selection
  selectedVoice: Voice | null = null;

  // Form fields
  ttsName = '';
  customIntros: CustomIntro[] = [];

  // Loading and error states
  loading = false;
  saving = false;
  error: string | null = null;

  private router = inject(Router);
  private usersService = inject(UsersService);
  private voicesService = inject(VoicesService);
  private route = inject(ActivatedRoute);

  ngOnInit(): void {
    this.twitchUserId = this.route.snapshot.paramMap.get('twitchUserId') || '';
    
    if (!this.twitchUserId) {
      this.router.navigate(['/users']);
      return;
    }

    this.loadUser();
  }

  loadUser(): void {
    this.loading = true;
    this.usersService.getUser(this.twitchUserId).subscribe({
      next: (user) => {
        this.user = user;
        this.ttsName = user.ttsName || '';
        this.customIntros = [...(user.customIntros || [])];
        
        // Set selected voice if user has one
        if (user.ttsProviderName && user.ttsVoiceId) {
          this.voicesService.getVoices().subscribe({
            next: (voices) => {
              this.selectedVoice = voices.find(
                (v) => v.providerName === user.ttsProviderName && v.voiceId === user.ttsVoiceId
              ) || null;
            },
          });
        }
        
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading user:', error);
        this.error = 'Failed to load user';
        this.loading = false;
      },
    });
  }

  onVoiceSelected(voice: Voice | null): void {
    this.selectedVoice = voice;
  }

  addIntro(): void {
    this.customIntros.push({
      id: `temp-${Date.now()}`,
      twitchUserId: this.twitchUserId,
      introText: '',
    });
  }

  removeIntro(index: number): void {
    const intro = this.customIntros[index];
    if (intro.id.startsWith('temp-')) {
      // New intro, just remove from array
      this.customIntros.splice(index, 1);
    } else {
      // Existing intro, delete from server
      this.usersService.deleteCustomIntro(intro.id).subscribe({
        next: () => {
          this.customIntros.splice(index, 1);
        },
        error: (error) => {
          console.error('Error deleting intro:', error);
          this.error = 'Failed to delete intro';
        },
      });
    }
  }

  saveChanges(): void {
    if (!this.user) return;

    this.saving = true;
    this.error = null;

    const updates: any = {
      ttsName: this.ttsName || undefined,
    };

    if (this.selectedVoice) {
      updates.ttsProviderName = this.selectedVoice.providerName;
      updates.ttsVoiceId = this.selectedVoice.voiceId;
    } else {
      updates.ttsProviderName = undefined;
      updates.ttsVoiceId = undefined;
    }

    // Update user
    this.usersService.updateUser(this.twitchUserId, updates).subscribe({
      next: (updatedUser) => {
        // Save/update custom intros
        const introObservables = this.customIntros
          .map((intro) => {
            if (intro.id.startsWith('temp-')) {
              // New intro
              return this.usersService.addCustomIntro(this.twitchUserId, intro.introText);
            } else {
              // Update existing intro if text changed
              const originalIntro = this.user?.customIntros.find((i) => i.id === intro.id);
              if (originalIntro && originalIntro.introText !== intro.introText) {
                return this.usersService.updateCustomIntro(intro.id, intro.introText);
              }
            }
            return null;
          })
          .filter((obs) => obs !== null) as any[];

        if (introObservables.length === 0) {
          this.saving = false;
          this.loadUser();
          return;
        }

        // Use forkJoin to wait for all intro operations
        forkJoin(introObservables).subscribe({
          next: () => {
            this.saving = false;
            // Reload user to get updated data
            this.loadUser();
          },
          error: (error) => {
            console.error('Error saving intros:', error);
            this.error = 'Failed to save some intros';
            this.saving = false;
          },
        });
      },
      error: (error) => {
        console.error('Error updating user:', error);
        this.error = 'Failed to save changes';
        this.saving = false;
      },
    });
  }
}

