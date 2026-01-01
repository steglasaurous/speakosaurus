import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UsersService, User, CustomIntro } from '../../services/users.service';
import { VoicesService, Voice } from '../../services/voices.service';
import { Subject, forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './user-detail.component.html',
  styleUrl: './user-detail.component.scss',
})
export class UserDetailComponent implements OnInit {
  user: User | null = null;
  twitchUserId: string = '';

  // Voice autocomplete
  voiceSearchQuery: string = '';
  availableVoices: Voice[] = [];
  filteredVoices: Voice[] = [];
  showVoiceDropdown: boolean = false;
  voiceSearchSubject = new Subject<string>();
  selectedVoice: Voice | null = null;

  // Form fields
  ttsName: string = '';
  customIntros: CustomIntro[] = [];

  // Loading and error states
  loading: boolean = false;
  saving: boolean = false;
  error: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private usersService: UsersService,
    private voicesService: VoicesService
  ) {}

  ngOnInit(): void {
    this.twitchUserId = this.route.snapshot.paramMap.get('twitchUserId') || '';
    
    if (!this.twitchUserId) {
      this.router.navigate(['/users']);
      return;
    }

    this.loadUser();
    this.loadVoices();

    // Set up voice search debouncing
    this.voiceSearchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.voicesService.searchVoices(query))
      )
      .subscribe((voices) => {
        this.filteredVoices = voices;
      });
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
              this.availableVoices = voices;
              this.filteredVoices = voices;
              this.selectedVoice = voices.find(
                (v) => v.providerName === user.ttsProviderName && v.voiceId === user.ttsVoiceId
              ) || null;
              
              // Set the display name using voiceName if found
              if (this.selectedVoice) {
                this.voiceSearchQuery = this.voicesService.getVoiceDisplayName(this.selectedVoice);
              } else {
                // Fallback to voiceId if voice not found
                this.voiceSearchQuery = `${user.ttsProviderName} - ${user.ttsVoiceId}`;
              }
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

  loadVoices(): void {
    this.voicesService.getVoices().subscribe({
      next: (voices) => {
        this.availableVoices = voices;
        this.filteredVoices = voices;
      },
      error: (error) => {
        console.error('Error loading voices:', error);
      },
    });
  }

  onVoiceSearchInput(): void {
    this.voiceSearchSubject.next(this.voiceSearchQuery);
    this.showVoiceDropdown = true;
  }

  onVoiceInputFocus(): void {
    this.showVoiceDropdown = true;
    this.voiceSearchSubject.next(this.voiceSearchQuery);
  }

  onVoiceInputBlur(): void {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      this.showVoiceDropdown = false;
    }, 200);
  }

  selectVoice(voice: Voice): void {
    this.selectedVoice = voice;
    this.voiceSearchQuery = this.voicesService.getVoiceDisplayName(voice);
    this.showVoiceDropdown = false;
  }

  getGroupedVoices(): { provider: string; voices: Voice[] }[] {
    const grouped: Record<string, Voice[]> = {};
    
    this.filteredVoices.forEach((voice) => {
      if (!grouped[voice.providerName]) {
        grouped[voice.providerName] = [];
      }
      grouped[voice.providerName].push(voice);
    });

    return Object.keys(grouped)
      .sort()
      .map((provider) => ({
        provider,
        voices: grouped[provider],
      }));
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

