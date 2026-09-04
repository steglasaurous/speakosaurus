import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Subject, firstValueFrom, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { UsersService, User } from '../../services/users.service';
import { VoicesService, Voice } from '../../services/voices.service';
import { TwitchService, TwitchUser } from '../../services/twitch.service';
import { UserDetailComponent } from '../user-detail/user-detail.component';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [FormsModule, UserDetailComponent],
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.scss',
})
export class UserListComponent implements OnInit, OnDestroy {
  users: User[] = [];
  filteredUsers: User[] = [];
  searchQuery = '';
  selectedUserId: string | null = null;
  
  // Twitch search
  showTwitchSearch = false;
  twitchSearchQuery = '';
  twitchSearchResults: TwitchUser[] = [];
  isSearchingTwitch = false;
  addingUserIds = new Set<string>(); // Track which users are being added
  twitchSearchSubject = new Subject<string>();
  isAuthenticated = false;
  authError: string | null = null;
  deviceCodeInfo: { userCode: string; verificationUri: string } | null = null;
  isPollingAuth = false;
  pollingSubscription: { unsubscribe: () => void } | null = null;
  
  @ViewChild('twitchSearchInput', { static: false }) twitchSearchInput!: ElementRef<HTMLInputElement>;
  private shouldRefocusInput = false;
  
  private usersService = inject(UsersService);
  private voicesService = inject(VoicesService);
  twitchService = inject(TwitchService); // Made public for template access
  private cdr = inject(ChangeDetectorRef);
  private voices: Voice[] = [];
  private usersSubscription?: Subscription;
  private previousBodyOverflow = '';
  private isBodyScrollLocked = false;

  ngOnInit(): void {
    this.loadVoices();
    this.checkAuthStatus();
    
    // Subscribe to real-time user updates via SSE
    this.usersSubscription = this.usersService.users$.subscribe({
      next: (users) => {
        this.users = this.sortUsers(users);
        this.filterUsers();
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error in user stream:', error);
      },
    });

    // Set up Twitch search debouncing
    this.twitchSearchSubject
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap((query) => {
          this.isSearchingTwitch = true;
          return this.twitchService.searchUsers(query);
        })
      )
      .subscribe({
        next: (users) => {
          this.twitchSearchResults = users;
          this.isSearchingTwitch = false;
          // Refocus the input after results are updated
          this.shouldRefocusInput = true;
          setTimeout(() => {
            if (this.shouldRefocusInput && this.twitchSearchInput?.nativeElement) {
              this.twitchSearchInput.nativeElement.focus();
              this.shouldRefocusInput = false;
            }
          }, 0);
        },
        error: (error) => {
          console.error('Error searching Twitch users:', error);
          this.isSearchingTwitch = false;
          this.twitchSearchResults = [];
          // Refocus the input after error
          this.shouldRefocusInput = true;
          setTimeout(() => {
            if (this.shouldRefocusInput && this.twitchSearchInput?.nativeElement) {
              this.twitchSearchInput.nativeElement.focus();
              this.shouldRefocusInput = false;
            }
          }, 0);
        },
      });
  }

  checkAuthStatus(): void {
    this.twitchService.isAuthenticated().subscribe({
      next: (authenticated) => {
        this.isAuthenticated = authenticated;
      },
      error: () => {
        this.isAuthenticated = false;
      },
    });
  }

  loadVoices(): void {
    this.voicesService.getVoices().subscribe({
      next: (voices) => {
        this.voices = voices;
      },
      error: (error) => {
        console.error('Error loading voices:', error);
      },
    });
  }

  sortUsers(users: User[]): User[] {
    return [...users].sort((a, b) => 
      a.twitchUsername.toLowerCase().localeCompare(b.twitchUsername.toLowerCase())
    );
  }

  filterUsers(): void {
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      this.filteredUsers = this.users;
      return;
    }

    const query = this.searchQuery.toLowerCase();
    const filtered = this.users.filter(
      (user) =>
        user.twitchUsername.toLowerCase().includes(query) ||
        (user.ttsName && user.ttsName.toLowerCase().includes(query))
    );
    // Ensure filtered results are also sorted
    this.filteredUsers = this.sortUsers(filtered);
  }

  getVoiceDisplayName(user: User): string {
    if (user.ttsProviderName && user.ttsVoiceId) {
      // Try to find the voice to get the voiceName
      const voice = this.voices.find(
        (v) => v.providerName === user.ttsProviderName && v.voiceId === user.ttsVoiceId
      );
      
      if (voice) {
        return `${voice.providerName} - ${voice.voiceName}`;
      }
      // Fallback to voiceId if voice not found
      return `${user.ttsProviderName} - ${user.ttsVoiceId}`;
    }
    return 'Not set';
  }

  getIntroCount(user: User): number {
    return user.customIntros?.length || 0;
  }

  getPronounDisplayName(pronouns?: string): string {
    switch (pronouns) {
      case 'hehim':
        return 'He/Him';
      case 'sheher':
        return 'She/Her';
      case 'theythem':
        return 'They/Them';
      default:
        return pronouns || 'Not set';
    }
  }

  openUser(user: User): void {
    this.selectedUserId = user.twitchUserId;
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.isBodyScrollLocked = true;
  }

  closeUser(): void {
    this.selectedUserId = null;
    this.restoreBodyScrolling();
  }

  private restoreBodyScrolling(): void {
    if (!this.isBodyScrollLocked) {
      return;
    }

    document.body.style.overflow = this.previousBodyOverflow;
    this.isBodyScrollLocked = false;
  }

  toggleTwitchSearch(): void {
    this.showTwitchSearch = !this.showTwitchSearch;
    if (this.showTwitchSearch) {
      this.checkAuthStatus();
    } else {
      this.twitchSearchQuery = '';
      this.twitchSearchResults = [];
      this.authError = null;
      this.deviceCodeInfo = null;
      this.stopPolling();
    }
  }

  startDeviceCodeFlow(): void {
    this.authError = null;
    this.deviceCodeInfo = null;
    this.isPollingAuth = true;

    this.twitchService.startDeviceCodeFlow().subscribe({
      next: (info) => {
        this.deviceCodeInfo = {
          userCode: info.userCode,
          verificationUri: info.verificationUri,
        };
        // Start polling
        this.startPolling(info.interval * 1000);
      },
      error: (error) => {
        console.error('Failed to start device code flow:', error);
        this.authError = error.message || 'Failed to start authentication';
        this.isPollingAuth = false;
      },
    });
  }

  startPolling(intervalMs: number): void {
    this.stopPolling();
    
    this.pollingSubscription = this.twitchService.pollDeviceCodeUntilComplete(intervalMs).subscribe({
      next: (result) => {
        if (result.success) {
          this.isPollingAuth = false;
          this.deviceCodeInfo = null;
          this.checkAuthStatus();
          this.stopPolling();
        }
      },
      error: (error) => {
        console.error('Polling error:', error);
        this.isPollingAuth = false;
        this.authError = error.message || 'Authentication failed';
        this.stopPolling();
      },
    });
  }

  stopPolling(): void {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
      this.pollingSubscription = null;
    }
  }

  openVerificationUri(): void {
    const verificationUri = this.deviceCodeInfo?.verificationUri;
    if (verificationUri) {
      // Check if we're in Electron and use the IPC bridge to open in default browser
      if (typeof window !== 'undefined' && (window as any).electron?.openExternal) {
        (window as any).electron.openExternal(verificationUri).catch((error: any) => {
          console.error('Error opening external URL:', error);
          // Fallback to window.open if IPC fails
          window.open(verificationUri, '_blank');
        });
      } else {
        // Fallback for non-Electron environments (e.g., web browser)
        window.open(verificationUri, '_blank');
      }
    }
  }

  onTwitchSearchInput(): void {
    if (this.twitchSearchQuery.trim()) {
      this.twitchSearchSubject.next(this.twitchSearchQuery);
    } else {
      this.twitchSearchResults = [];
    }
  }

  async addTwitchUser(twitchUser: TwitchUser): Promise<void> {
    // Check if user already exists
    const existingUser = this.users.find(
      (u) => u.twitchUserId === twitchUser.id
    );
    if (existingUser) {
      alert(`User ${twitchUser.display_name} is already in the list.`);
      return;
    }

    // Check if already adding this user
    if (this.addingUserIds.has(twitchUser.id)) {
      return;
    }

    this.addingUserIds.add(twitchUser.id);
    // Reassign to trigger change detection
    this.addingUserIds = new Set(this.addingUserIds);
    try {
      const newUser = await firstValueFrom(
        this.usersService.createUser({
          twitchUserId: twitchUser.id,
          twitchUsername: twitchUser.login,
        })
      );

      if (newUser) {
        // Optimistic update - SSE will provide the authoritative update
        // The SSE stream will automatically update the list when the backend emits the event
        // Close search and clear
        // this.showTwitchSearch = false;
        // this.twitchSearchQuery = '';
        // this.twitchSearchResults = [];
      }
    } catch (error) {
      console.error('Error adding user:', error);
      const httpError = error as { status?: number; message?: string };
      if (httpError.status === 409 || httpError.status === 400) {
        alert(`User ${twitchUser.display_name} already exists or could not be added.`);
      } else {
        alert('Error adding user: ' + (httpError.message || 'Unknown error'));
      }
    } finally {
      this.addingUserIds.delete(twitchUser.id);
      // Reassign to trigger change detection (Angular doesn't detect Set mutations)
      this.addingUserIds = new Set(this.addingUserIds);
      this.cdr.detectChanges(); // Force change detection to update the UI
    }
  }

  isUserBeingAdded(twitchUserId: string): boolean {
    return this.addingUserIds.has(twitchUserId);
  }

  isUserAlreadyAdded(twitchUserId: string): boolean {
    return this.users.some((u) => u.twitchUserId === twitchUserId);
  }

  ngOnDestroy(): void {
    this.restoreBodyScrolling();
    this.stopPolling();
    this.usersSubscription?.unsubscribe();
  }
}

