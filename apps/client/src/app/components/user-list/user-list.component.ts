import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UsersService, User } from '../../services/users.service';
import { VoicesService, Voice } from '../../services/voices.service';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.scss',
})
export class UserListComponent implements OnInit {
  users: User[] = [];
  filteredUsers: User[] = [];
  searchQuery = '';
  private usersService = inject(UsersService);
  private voicesService = inject(VoicesService);
  private voices: Voice[] = [];

  ngOnInit(): void {
    this.loadVoices();
    this.loadUsers();
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

  loadUsers(): void {
    this.usersService.getAllUsers().subscribe({
      next: (users) => {
        this.users = users;
        this.filterUsers();
      },
      error: (error) => {
        console.error('Error loading users:', error);
      },
    });
  }

  filterUsers(): void {
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      this.filteredUsers = this.users;
      return;
    }

    const query = this.searchQuery.toLowerCase();
    this.filteredUsers = this.users.filter(
      (user) =>
        user.twitchUsername.toLowerCase().includes(query) ||
        (user.ttsName && user.ttsName.toLowerCase().includes(query))
    );
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
}

