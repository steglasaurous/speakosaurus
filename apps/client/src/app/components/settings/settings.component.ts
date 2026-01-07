import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { SettingsService, Setting, SettingType } from '../../services/settings.service';
import { VoicesService, Voice } from '../../services/voices.service';
import { TwitchService, TwitchUser } from '../../services/twitch.service';
import { UsersService, User } from '../../services/users.service';
import { forkJoin, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { VoiceSelectorComponent } from '../voice-selector/voice-selector.component';

interface SubGroupedSettings {
  subGroup?: string;
  settings: Setting[];
}

interface GroupedSettings {
  group: string;
  subGroups: SubGroupedSettings[];
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, VoiceSelectorComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  settings: Setting[] = [];
  groupedSettings: GroupedSettings[] = [];
  activeTab = '';
  
  loading = false;
  saving = false;
  error: string | null = null;
  successMessage: string | null = null;
  
  // Track original values to detect changes
  private originalValues: { [key: string]: string | null } = {};

  // Voice selection for VOICE type settings
  selectedVoices: { [key: string]: Voice | null } = {};

  // Cached array values to prevent re-parsing on every change detection
  arrayCache: { [key: string]: string[] } = {};

  // User list search state per setting
  userListSearchQueries: { [key: string]: string } = {};
  userListSearchResults: { [key: string]: TwitchUser[] } = {};
  userListLocalUsers: { [key: string]: User[] } = {};
  userListSearching: { [key: string]: boolean } = {};
  userListShowDropdown: { [key: string]: boolean } = {};
  userListDropdownAbove: { [key: string]: boolean } = {};
  userListSearchSubjects: { [key: string]: Subject<string> } = {};

  private settingsService = inject(SettingsService);
  private voicesService = inject(VoicesService);
  private twitchService = inject(TwitchService);
  private usersService = inject(UsersService);
  private router = inject(Router);

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.loading = true;
    this.settingsService.getAllSettings().subscribe({
      next: (settings) => {
        this.settings = settings;
        // Store original values to detect changes
        this.originalValues = {};
        settings.forEach((setting) => {
          this.originalValues[setting.name] = setting.value;
        });
        // Initialize array cache for array-type settings
        this.settings
          .filter((s) => s.type === SettingType.ARRAY)
          .forEach((setting) => {
            try {
              const parsed = JSON.parse(setting.value || '[]');
              this.arrayCache[setting.name] = Array.isArray(parsed) ? parsed : [];
            } catch {
              this.arrayCache[setting.name] = [];
            }
          });
        // Initialize user list cache for userList-type settings
        this.settings
          .filter((s) => s.type === SettingType.USER_LIST)
          .forEach((setting) => {
            try {
              const parsed = JSON.parse(setting.value || '[]');
              this.arrayCache[setting.name] = Array.isArray(parsed) ? parsed : [];
            } catch {
              this.arrayCache[setting.name] = [];
            }
            // Initialize search state
            this.userListSearchQueries[setting.name] = '';
            this.userListSearchResults[setting.name] = [];
            this.userListLocalUsers[setting.name] = [];
            this.userListSearching[setting.name] = false;
            this.userListShowDropdown[setting.name] = false;
            this.userListDropdownAbove[setting.name] = false;
            this.initializeUserListSearch(setting.name);
          });
        this.groupSettings();
        if (this.groupedSettings.length > 0 && !this.activeTab) {
          this.activeTab = this.groupedSettings[0].group;
        }
        this.initializeVoiceSettings();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading settings:', error);
        this.error = 'Failed to load settings';
        this.loading = false;
      },
    });
  }


  groupSettings(): void {
    // First group by main group
    const grouped: { [key: string]: Setting[] } = {};
    
    this.settings.forEach((setting) => {
      if (!grouped[setting.group]) {
        grouped[setting.group] = [];
      }
      grouped[setting.group].push(setting);
    });

    // Then within each group, organize by subGroup
    this.groupedSettings = Object.keys(grouped)
      .sort()
      .map((group) => {
        const settings = grouped[group];
        const subGrouped: { [key: string]: Setting[] } = {};
        
        settings.forEach((setting) => {
          const subGroupKey = setting.subGroup || '';
          if (!subGrouped[subGroupKey]) {
            subGrouped[subGroupKey] = [];
          }
          subGrouped[subGroupKey].push(setting);
        });

        // Sort subgroups: empty string (no subgroup) first, then alphabetically
        const subGroups = Object.keys(subGrouped)
          .sort((a, b) => {
            if (a === '') return -1;
            if (b === '') return 1;
            return a.localeCompare(b);
          })
          .map((subGroupKey) => ({
            subGroup: subGroupKey || undefined,
            settings: subGrouped[subGroupKey],
          }));

        return {
          group,
          subGroups,
        };
      });
  }

  initializeVoiceSettings(): void {
    this.settings
      .filter((s) => s.type === SettingType.VOICE)
      .forEach((setting) => {
        this.selectedVoices[setting.name] = null;

        // Set initial value if setting has a value
        if (setting.value) {
          try {
            const voiceData = JSON.parse(setting.value);
            if (voiceData.providerName && voiceData.voiceId) {
              this.voicesService.getVoices().subscribe({
                next: (voices) => {
                  const voice = voices.find(
                    (v) =>
                      v.providerName === voiceData.providerName &&
                      v.voiceId === voiceData.voiceId
                  );
                  if (voice) {
                    this.selectedVoices[setting.name] = voice;
                  }
                },
              });
            }
          } catch {
            // Invalid JSON, ignore
          }
        }
      });
  }

  getSettingsForActiveTab(): GroupedSettings | null {
    return this.groupedSettings.find((g) => g.group === this.activeTab) || null;
  }

  getSettingValue(setting: Setting): any {
    if (setting.value === null || setting.value === undefined) {
      return setting.default || '';
    }
    return setting.value;
  }

  onSettingChange(setting: Setting, value: any): void {
    let stringValue: string;
    
    if (setting.type === SettingType.BOOLEAN) {
      stringValue = value ? 'true' : 'false';
    } else if (setting.type === SettingType.ARRAY || setting.type === SettingType.JSON || setting.type === SettingType.USER_LIST) {
      stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    } else {
      stringValue = String(value);
    }

    setting.value = stringValue;
  }

  onVoiceSelected(setting: Setting, voice: Voice | null): void {
    this.selectedVoices[setting.name] = voice;
    
    // Update setting value with JSON representation
    if (voice) {
      setting.value = JSON.stringify({
        providerName: voice.providerName,
        voiceId: voice.voiceId,
      });
    } else {
      setting.value = '';
    }
  }

  parseArrayValue(setting: Setting): string[] {
    // Use cached array if available, otherwise parse and cache
    if (!this.arrayCache[setting.name]) {
      try {
        const parsed = JSON.parse(setting.value || '[]');
        this.arrayCache[setting.name] = Array.isArray(parsed) ? parsed : [];
      } catch {
        this.arrayCache[setting.name] = [];
      }
    }
    return this.arrayCache[setting.name];
  }

  syncArrayToSetting(setting: Setting): void {
    // Update the setting value from the cached array
    setting.value = JSON.stringify(this.arrayCache[setting.name] || []);
  }

  addArrayItem(setting: Setting): void {
    const array = this.parseArrayValue(setting);
    array.push('');
    this.syncArrayToSetting(setting);
  }

  removeArrayItem(setting: Setting, index: number): void {
    const array = this.parseArrayValue(setting);
    array.splice(index, 1);
    this.syncArrayToSetting(setting);
  }

  updateArrayItem(setting: Setting, index: number, value: string): void {
    const array = this.parseArrayValue(setting);
    array[index] = value;
    this.syncArrayToSetting(setting);
  }

  trackByIndex(index: number): number {
    return index;
  }

  // User list methods
  initializeUserListSearch(settingName: string): void {
    if (!this.userListSearchSubjects[settingName]) {
      this.userListSearchSubjects[settingName] = new Subject<string>();
      
      this.userListSearchSubjects[settingName]
        .pipe(
          debounceTime(300),
          distinctUntilChanged(),
          switchMap((query: string) => {
            if (!query || query.trim() === '') {
              this.userListSearchResults[settingName] = [];
              this.userListLocalUsers[settingName] = [];
              this.userListSearching[settingName] = false;
              return forkJoin({
                local: this.usersService.searchUsers(''),
                twitch: this.twitchService.searchUsers(''),
              });
            }
            this.userListSearching[settingName] = true;
            // Search both local users and Twitch users in parallel
            return forkJoin({
              local: this.usersService.searchUsers(query),
              twitch: this.twitchService.searchUsers(query),
            });
          })
        )
        .subscribe({
          next: (results) => {
            this.userListLocalUsers[settingName] = results.local || [];
            this.userListSearchResults[settingName] = results.twitch || [];
            this.userListSearching[settingName] = false;
          },
          error: (error) => {
            console.error('Error searching users:', error);
            this.userListSearchResults[settingName] = [];
            this.userListLocalUsers[settingName] = [];
            this.userListSearching[settingName] = false;
          },
        });
    }
  }

  onUserListSearchInput(setting: Setting, query: string): void {
    this.userListSearchQueries[setting.name] = query;
    const shouldShow = query.trim().length > 0;
    this.userListShowDropdown[setting.name] = shouldShow;
    
    if (shouldShow) {
      // Check available space and position dropdown accordingly
      setTimeout(() => this.checkDropdownPosition(setting.name), 0);
    }
    
    if (this.userListSearchSubjects[setting.name]) {
      this.userListSearchSubjects[setting.name].next(query);
    }
  }

  checkDropdownPosition(settingName: string): void {
    const inputId = `setting-${settingName}-search`;
    const inputElement = document.getElementById(inputId);
    if (!inputElement) {
      return;
    }

    const inputRect = inputElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - inputRect.bottom;
    const spaceAbove = inputRect.top;
    const estimatedDropdownHeight = 300; // max-height

    // Position dropdown above if there's not enough space below but enough space above
    this.userListDropdownAbove[settingName] = 
      spaceBelow < estimatedDropdownHeight && spaceAbove > spaceBelow;
  }

  addUserToList(setting: Setting, twitchUser: TwitchUser): void {
    const userList = this.parseUserListValue(setting);
    const username = twitchUser.login.toLowerCase();
    
    // Check if user already in list
    if (!userList.includes(username)) {
      userList.push(username);
      this.syncUserListToSetting(setting);
    }
    
    // Clear search
    this.userListSearchQueries[setting.name] = '';
    this.userListShowDropdown[setting.name] = false;
    this.userListSearchResults[setting.name] = [];
    this.userListLocalUsers[setting.name] = [];
  }

  addLocalUserToList(setting: Setting, user: User): void {
    const userList = this.parseUserListValue(setting);
    const username = user.twitchUsername.toLowerCase();
    
    // Check if user already in list
    if (!userList.includes(username)) {
      userList.push(username);
      this.syncUserListToSetting(setting);
    }
    
    // Clear search
    this.userListSearchQueries[setting.name] = '';
    this.userListShowDropdown[setting.name] = false;
    this.userListSearchResults[setting.name] = [];
    this.userListLocalUsers[setting.name] = [];
  }

  removeUserFromList(setting: Setting, index: number): void {
    const userList = this.parseUserListValue(setting);
    userList.splice(index, 1);
    this.syncUserListToSetting(setting);
  }

  parseUserListValue(setting: Setting): string[] {
    // Use cached array if available, otherwise parse and cache
    if (!this.arrayCache[setting.name]) {
      try {
        const parsed = JSON.parse(setting.value || '[]');
        this.arrayCache[setting.name] = Array.isArray(parsed) ? parsed : [];
      } catch {
        this.arrayCache[setting.name] = [];
      }
    }
    return this.arrayCache[setting.name];
  }

  syncUserListToSetting(setting: Setting): void {
    // Update the setting value from the cached array
    setting.value = JSON.stringify(this.arrayCache[setting.name] || []);
  }


  onUserListFocus(setting: Setting): void {
    this.userListShowDropdown[setting.name] = (this.userListSearchQueries[setting.name] || '').trim().length > 0;
    if (this.userListShowDropdown[setting.name]) {
      // Check available space when focusing
      setTimeout(() => this.checkDropdownPosition(setting.name), 0);
    }
  }

  onUserListBlur(setting: Setting): void {
    // Delay hiding dropdown to allow click events
    setTimeout(() => {
      this.userListShowDropdown[setting.name] = false;
    }, 200);
  }


  saveAllSettings(): void {
    this.saving = true;
    this.error = null;
    this.successMessage = null;

    // Filter settings to only save those that have changed
    const settingsToSave = this.settings.filter((setting) => {
      const currentValue = setting.value || null;
      const originalValue = this.originalValues[setting.name] || null;
      
      // Skip if value hasn't changed
      if (currentValue === originalValue) {
        return false;
      }
      
      // Skip if current value is empty/null and original was also empty/null
      if (!currentValue && !originalValue) {
        return false;
      }
      
      return true;
    });

    if (settingsToSave.length === 0) {
      this.successMessage = 'No changes to save';
      this.saving = false;
      setTimeout(() => {
        this.successMessage = null;
      }, 3000);
      return;
    }

    const saveObservables = settingsToSave.map((setting) =>
      this.settingsService.updateSetting(
        setting.name,
        setting.value || setting.default || ''
      )
    );

    forkJoin(saveObservables).subscribe({
      next: () => {
        // Update original values after successful save
        settingsToSave.forEach((setting) => {
          this.originalValues[setting.name] = setting.value;
        });
        this.successMessage = `${settingsToSave.length} setting${settingsToSave.length === 1 ? '' : 's'} saved successfully`;
        this.saving = false;
        setTimeout(() => {
          this.successMessage = null;
        }, 3000);
      },
      error: (error) => {
        console.error('Error saving settings:', error);
        this.error = 'Failed to save some settings';
        this.saving = false;
      },
    });
  }

  hasUnsavedChanges(): boolean {
    return this.settings.some((setting) => {
      const currentValue = setting.value || null;
      const originalValue = this.originalValues[setting.name] || null;
      return currentValue !== originalValue;
    });
  }

  onBackClick(event: Event): void {
    event.preventDefault();
    if (this.hasUnsavedChanges()) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to discard them and go back?');
      if (!confirmed) {
        return;
      }
    }
    this.router.navigate(['/users']);
  }
}

