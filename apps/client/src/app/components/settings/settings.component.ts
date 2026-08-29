import { Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SettingsService, Setting, SettingType } from '../../services/settings.service';
import { VoicesService, Voice } from '../../services/voices.service';
import { TwitchService, TwitchUser } from '../../services/twitch.service';
import { UsersService, User } from '../../services/users.service';
import { StreamerBotService, StreamerBotAction } from '../../services/streamerbot.service';
import { forkJoin, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { VoiceSelectorComponent } from '../voice-selector/voice-selector.component';

interface WordReplacement {
  from: string;
  to: string;
  caseSensitive: boolean;
}

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
  @Input() modalMode = false;
  @Output() closed = new EventEmitter<void>();

  settings: Setting[] = [];
  groupedSettings: GroupedSettings[] = [];
  activeTab = '';
  
  loading = false;
  saving = false;
  populatingPronouns = false;
  error: string | null = null;
  successMessage: string | null = null;
  
  // Track original values to detect changes
  private originalValues: { [key: string]: string | null } = {};

  // Voice selection for VOICE type settings
  selectedVoices: { [key: string]: Voice | null } = {};

  // Cached array values to prevent re-parsing on every change detection
  arrayCache: { [key: string]: string[] } = {};

  // Cached word replacement rules
  wordReplacementsCache: { [key: string]: WordReplacement[] } = {};

  // User list search state per setting
  userListSearchQueries: { [key: string]: string } = {};
  userListSearchResults: { [key: string]: TwitchUser[] } = {};
  userListLocalUsers: { [key: string]: User[] } = {};
  userListSearching: { [key: string]: boolean } = {};
  userListShowDropdown: { [key: string]: boolean } = {};
  userListDropdownAbove: { [key: string]: boolean } = {};
  userListSearchSubjects: { [key: string]: Subject<string> } = {};

  // StreamerBot action search state per setting
  streamerBotActionSearchQueries: { [key: string]: string } = {};
  streamerBotActionSearchResults: { [key: string]: StreamerBotAction[] } = {};
  streamerBotActionAllActions: { [key: string]: StreamerBotAction[] } = {};
  streamerBotActionSearching: { [key: string]: boolean } = {};
  streamerBotActionShowDropdown: { [key: string]: boolean } = {};
  streamerBotActionDropdownAbove: { [key: string]: boolean } = {};
  streamerBotActionSearchSubjects: { [key: string]: Subject<string> } = {};

  // Track visibility state for sensitive settings
  sensitiveSettingsVisible: { [key: string]: boolean } = {};

  // Cache of subgroup descriptions extracted from settings
  private subGroupDescriptionCache: { [key: string]: string } = {};

  private settingsService = inject(SettingsService);
  private voicesService = inject(VoicesService);
  private twitchService = inject(TwitchService);
  private usersService = inject(UsersService);
  private streamerBotService = inject(StreamerBotService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  ngOnInit(): void {
    this.loadSettings();
    
    // Check for tab query parameter
    this.route.queryParams.subscribe((params) => {
      if (params['tab']) {
        // Set active tab after settings are loaded
        setTimeout(() => {
          const tabExists = this.groupedSettings.some((g) => g.group === params['tab']);
          if (tabExists) {
            this.activeTab = params['tab'];
          }
        }, 100);
      }
    });
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
        // Build subgroup description cache from settings
        this.subGroupDescriptionCache = {};
        settings.forEach((setting) => {
          if (setting.subGroupDescription && setting.subGroup) {
            const key = `${setting.group}::${setting.subGroup}`;
            // Only store if not already set (first setting with description wins)
            if (!this.subGroupDescriptionCache[key]) {
              this.subGroupDescriptionCache[key] = setting.subGroupDescription;
            }
          }
        });
        // Initialize array cache for array-type settings
        this.settings
          .filter((s) => s.type === SettingType.ARRAY)
          .forEach((setting) => {
            try {
              const valueToParse = setting.value || setting.default || '[]';
              const parsed = JSON.parse(valueToParse);
              this.arrayCache[setting.name] = Array.isArray(parsed) ? parsed : [];
            } catch {
              this.arrayCache[setting.name] = [];
            }
          });
        // Initialize word replacement cache
        this.settings
          .filter((s) => s.type === SettingType.WORD_REPLACEMENTS)
          .forEach((setting) => {
            this.wordReplacementsCache[setting.name] = this.parseWordReplacementsJson(
              setting.value || setting.default || '[]'
            );
          });
        // Initialize user list cache for userList-type settings
        this.settings
          .filter((s) => s.type === SettingType.USER_LIST)
          .forEach((setting) => {
            try {
              const valueToParse = setting.value || setting.default || '[]';
              const parsed = JSON.parse(valueToParse);
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
        // Initialize StreamerBot action settings
        this.settings
          .filter((s) => s.type === SettingType.STREAMERBOT_ACTION)
          .forEach((setting) => {
            // Initialize search state
            this.streamerBotActionSearchQueries[setting.name] = '';
            this.streamerBotActionSearchResults[setting.name] = [];
            this.streamerBotActionAllActions[setting.name] = [];
            this.streamerBotActionSearching[setting.name] = false;
            this.streamerBotActionShowDropdown[setting.name] = false;
            this.streamerBotActionDropdownAbove[setting.name] = false;
            // Load actions - this will populate allActions which is used by getStreamerBotActionDisplayName
            this.initializeStreamerBotActionSearch(setting.name);
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
      // Filter out internal settings group
      if (setting.group === 'Internal') {
        return;
      }
      
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
                    this.selectedVoices[setting.name] = {
                      ...voice,
                      tweaks: voiceData.tweaks ?? voice.tweaks,
                    };
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

  selectTab(group: string): void {
    this.activeTab = group;

    if (this.modalMode) {
      this.elementRef.nativeElement.scrollTo({ top: 0 });
    } else {
      window.scrollTo({ top: 0 });
    }
  }

  getSettingValue(setting: Setting): any {
    if (setting.value === null || setting.value === undefined) {
      return setting.default || '';
    }
    return setting.value;
  }

  getEnumOptionLabel(setting: Setting, option: string): string {
    const description = setting.optionDescriptions?.[option];
    if (setting.name === 'defaultLanguage' && description) {
      return description;
    }
    return description ? `${option} - ${description}` : option;
  }

  onSettingChange(setting: Setting, value: any): void {
    let stringValue: string;
    
    if (setting.type === SettingType.BOOLEAN) {
      stringValue = value ? 'true' : 'false';
    } else if (
      setting.type === SettingType.ARRAY ||
      setting.type === SettingType.JSON ||
      setting.type === SettingType.USER_LIST ||
      setting.type === SettingType.WORD_REPLACEMENTS
    ) {
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
        tweaks: voice.tweaks,
      });
    } else {
      setting.value = '';
    }
  }

  parseArrayValue(setting: Setting): string[] {
    // Use cached array if available, otherwise parse and cache
    if (!this.arrayCache[setting.name]) {
      try {
        const valueToParse = setting.value || setting.default || '[]';
        const parsed = JSON.parse(valueToParse);
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

  parseWordReplacementsValue(setting: Setting): WordReplacement[] {
    if (!this.wordReplacementsCache[setting.name]) {
      this.wordReplacementsCache[setting.name] = this.parseWordReplacementsJson(
        setting.value || setting.default || '[]'
      );
    }
    return this.wordReplacementsCache[setting.name];
  }

  private parseWordReplacementsJson(value: string): WordReplacement[] {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((item) => ({
        from: typeof item?.from === 'string' ? item.from : '',
        to: typeof item?.to === 'string' ? item.to : '',
        caseSensitive: item?.caseSensitive === true,
      }));
    } catch {
      return [];
    }
  }

  syncWordReplacementsToSetting(setting: Setting): void {
    setting.value = JSON.stringify(this.wordReplacementsCache[setting.name] || []);
  }

  addWordReplacement(setting: Setting): void {
    const replacements = this.parseWordReplacementsValue(setting);
    replacements.push({ from: '', to: '', caseSensitive: false });
    this.syncWordReplacementsToSetting(setting);
  }

  removeWordReplacement(setting: Setting, index: number): void {
    const replacements = this.parseWordReplacementsValue(setting);
    replacements.splice(index, 1);
    this.syncWordReplacementsToSetting(setting);
  }

  updateWordReplacementField(
    setting: Setting,
    index: number,
    field: 'from' | 'to',
    value: string
  ): void {
    const replacements = this.parseWordReplacementsValue(setting);
    replacements[index][field] = value;
    this.syncWordReplacementsToSetting(setting);
  }

  updateWordReplacementCaseSensitive(setting: Setting, index: number, value: boolean): void {
    const replacements = this.parseWordReplacementsValue(setting);
    replacements[index].caseSensitive = value;
    this.syncWordReplacementsToSetting(setting);
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
        const valueToParse = setting.value || setting.default || '[]';
        const parsed = JSON.parse(valueToParse);
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

  // StreamerBot action methods
  initializeStreamerBotActionSearch(settingName: string): void {
    // Load all actions once
    this.streamerBotActionSearching[settingName] = true;
    this.streamerBotService.getActions().subscribe({
      next: (actions) => {
        this.streamerBotActionAllActions[settingName] = actions || [];
        this.streamerBotActionSearching[settingName] = false;
      },
      error: (error) => {
        console.error('Error loading StreamerBot actions:', error);
        this.streamerBotActionAllActions[settingName] = [];
        this.streamerBotActionSearching[settingName] = false;
      },
    });

    if (!this.streamerBotActionSearchSubjects[settingName]) {
      this.streamerBotActionSearchSubjects[settingName] = new Subject<string>();
      
      this.streamerBotActionSearchSubjects[settingName]
        .pipe(
          debounceTime(300),
          distinctUntilChanged(),
        )
        .subscribe({
          next: (query: string) => {
            this.filterStreamerBotActions(settingName, query);
          },
        });
    }
  }

  filterStreamerBotActions(settingName: string, query: string): void {
    const allActions = this.streamerBotActionAllActions[settingName] || [];
    const lowerQuery = query.toLowerCase().trim();
    
    if (!lowerQuery) {
      this.streamerBotActionSearchResults[settingName] = [];
      return;
    }

    this.streamerBotActionSearchResults[settingName] = allActions.filter((action) =>
      action.name.toLowerCase().includes(lowerQuery) ||
      (action.group && action.group.toLowerCase().includes(lowerQuery))
    );
  }

  onStreamerBotActionSearchInput(setting: Setting, query: string): void {
    this.streamerBotActionSearchQueries[setting.name] = query;
    const shouldShow = query.trim().length > 0;
    this.streamerBotActionShowDropdown[setting.name] = shouldShow;
    
    if (shouldShow) {
      // Check available space and position dropdown accordingly
      setTimeout(() => this.checkStreamerBotActionDropdownPosition(setting.name), 0);
    }
    
    if (this.streamerBotActionSearchSubjects[setting.name]) {
      this.streamerBotActionSearchSubjects[setting.name].next(query);
    }
  }

  checkStreamerBotActionDropdownPosition(settingName: string): void {
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
    this.streamerBotActionDropdownAbove[settingName] = 
      spaceBelow < estimatedDropdownHeight && spaceAbove > spaceBelow;
  }

  selectStreamerBotAction(setting: Setting, action: StreamerBotAction): void {
    // Save the action's id
    setting.value = action.id;
    
    // Clear search
    this.streamerBotActionSearchQueries[setting.name] = '';
    this.streamerBotActionShowDropdown[setting.name] = false;
    this.streamerBotActionSearchResults[setting.name] = [];
  }

  clearStreamerBotAction(setting: Setting): void {
    setting.value = '';
  }

  getStreamerBotActionDisplayName(setting: Setting): string {
    if (!setting.value) {
      return '';
    }
    
    // Find the action by id in the cached actions
    const allActions = this.streamerBotActionAllActions[setting.name] || [];
    const action = allActions.find((a) => a.id === setting.value);
    return action ? action.name : '';
  }

  onStreamerBotActionFocus(setting: Setting): void {
    this.streamerBotActionShowDropdown[setting.name] = (this.streamerBotActionSearchQueries[setting.name] || '').trim().length > 0;
    if (this.streamerBotActionShowDropdown[setting.name]) {
      // Check available space when focusing
      setTimeout(() => this.checkStreamerBotActionDropdownPosition(setting.name), 0);
    }
  }

  onStreamerBotActionBlur(setting: Setting): void {
    // Delay hiding dropdown to allow click events
    setTimeout(() => {
      this.streamerBotActionShowDropdown[setting.name] = false;
    }, 200);
  }

  populateMissingPronouns(): void {
    if (this.populatingPronouns) {
      return;
    }

    this.populatingPronouns = true;
    this.error = null;
    this.successMessage = null;

    this.usersService.populateMissingPronouns().subscribe({
      next: (result) => {
        this.successMessage =
          `Checked ${result.checked} ${result.checked === 1 ? 'user' : 'users'} and updated ${result.updated}. ` +
          `${result.unchanged} ${result.unchanged === 1 ? 'user remains' : 'users remain'} without pronouns.`;
        this.populatingPronouns = false;
      },
      error: (error) => {
        console.error('Error populating user pronouns:', error);
        this.error = 'Failed to populate user pronouns. Please try again.';
        this.populatingPronouns = false;
      },
    });
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
      if (this.modalMode) {
        this.closed.emit();
        this.saving = false;
        return;
      }

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
        if (this.modalMode) {
          this.saving = false;
          this.closed.emit();
          return;
        }

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

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.modalMode) {
      this.requestClose();
    }
  }

  onBackClick(event: Event): void {
    event.preventDefault();
    this.requestClose();
  }

  requestClose(): void {
    if (this.hasUnsavedChanges()) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to discard them?');
      if (!confirmed) {
        return;
      }
    }

    if (this.modalMode) {
      this.closed.emit();
    } else {
      this.router.navigate(['/users']);
    }
  }

  toggleSensitiveVisibility(setting: Setting): void {
    this.sensitiveSettingsVisible[setting.name] = !this.sensitiveSettingsVisible[setting.name];
  }

  isSensitiveVisible(setting: Setting): boolean {
    return this.sensitiveSettingsVisible[setting.name] || false;
  }

  /**
   * Returns HTML content for a subgroup description/instructions.
   * This extracts the description from the settings data (which comes from the backend).
   * 
   * @param group The main group name
   * @param subGroup The subgroup name (optional)
   * @returns Sanitized HTML content or null if no content is defined
   */
  getSubGroupDescription(group: string, subGroup?: string): SafeHtml | null {
    const key = subGroup ? `${group}::${subGroup}` : group;
    const html = this.subGroupDescriptionCache[key];
    return html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
  }

  /**
   * Handles clicks on links within subgroup descriptions.
   * Opens external URLs in the system's default browser instead of Electron's webview.
   * 
   * @param event The click event
   */
  onSubGroupDescriptionClick(event: Event): void {
    const target = event.target as HTMLElement;
    const link = target.closest('a');
    
    if (link && link.href) {
      event.preventDefault();
      event.stopPropagation();
      
      const url = link.href;
      
      // Check if we're in Electron and use the IPC bridge to open in default browser
      if (typeof window !== 'undefined' && (window as any).electron?.openExternal) {
        (window as any).electron.openExternal(url).catch((error: any) => {
          console.error('Error opening external URL:', error);
          // Fallback to window.open if IPC fails
          window.open(url, '_blank');
        });
      } else {
        // Fallback for non-Electron environments (e.g., web browser)
        window.open(url, '_blank');
      }
    }
  }
}

