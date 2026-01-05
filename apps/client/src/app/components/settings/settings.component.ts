import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SettingsService, Setting, SettingType } from '../../services/settings.service';
import { VoicesService, Voice } from '../../services/voices.service';
import { Subject, forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

interface GroupedSettings {
  group: string;
  settings: Setting[];
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
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

  // Voice selection for VOICE type settings
  voiceSearchQueries: { [key: string]: string } = {};
  availableVoices: Voice[] = [];
  filteredVoices: { [key: string]: Voice[] } = {};
  showVoiceDropdowns: { [key: string]: boolean } = {};
  selectedVoices: { [key: string]: Voice | null } = {};
  voiceSearchSubjects: { [key: string]: Subject<string> } = {};

  // Cached array values to prevent re-parsing on every change detection
  arrayCache: { [key: string]: string[] } = {};

  private settingsService = inject(SettingsService);
  private voicesService = inject(VoicesService);

  ngOnInit(): void {
    this.loadSettings();
    this.loadVoices();
  }

  loadSettings(): void {
    this.loading = true;
    this.settingsService.getAllSettings().subscribe({
      next: (settings) => {
        this.settings = settings;
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

  loadVoices(): void {
    this.voicesService.getVoices().subscribe({
      next: (voices) => {
        this.availableVoices = voices;
        // Initialize filtered voices for all voice settings
        Object.keys(this.selectedVoices).forEach((settingName) => {
          this.filteredVoices[settingName] = voices;
        });
      },
      error: (error) => {
        console.error('Error loading voices:', error);
      },
    });
  }

  groupSettings(): void {
    const grouped: { [key: string]: Setting[] } = {};
    
    this.settings.forEach((setting) => {
      if (!grouped[setting.group]) {
        grouped[setting.group] = [];
      }
      grouped[setting.group].push(setting);
    });

    this.groupedSettings = Object.keys(grouped)
      .sort()
      .map((group) => ({
        group,
        settings: grouped[group],
      }));
  }

  initializeVoiceSettings(): void {
    this.settings
      .filter((s) => s.type === SettingType.VOICE)
      .forEach((setting) => {
        this.voiceSearchQueries[setting.name] = '';
        this.showVoiceDropdowns[setting.name] = false;
        this.selectedVoices[setting.name] = null;
        this.filteredVoices[setting.name] = this.availableVoices;

        // Create search subject for this setting
        const subject = new Subject<string>();
        subject
          .pipe(
            debounceTime(300),
            distinctUntilChanged(),
            switchMap((query) => this.voicesService.searchVoices(query))
          )
          .subscribe((voices) => {
            this.filteredVoices[setting.name] = voices;
          });
        this.voiceSearchSubjects[setting.name] = subject;

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
                    this.voiceSearchQueries[setting.name] =
                      this.voicesService.getVoiceDisplayName(voice);
                  }
                },
              });
            }
          } catch (e) {
            // Invalid JSON, ignore
          }
        }
      });
  }

  getSettingsForActiveTab(): Setting[] {
    const group = this.groupedSettings.find((g) => g.group === this.activeTab);
    return group ? group.settings : [];
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
    } else if (setting.type === SettingType.ARRAY || setting.type === SettingType.JSON) {
      stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    } else {
      stringValue = String(value);
    }

    setting.value = stringValue;
  }

  onVoiceSearchInput(settingName: string): void {
    this.voiceSearchSubjects[settingName].next(this.voiceSearchQueries[settingName]);
    this.showVoiceDropdowns[settingName] = true;
  }

  onVoiceInputFocus(settingName: string): void {
    this.showVoiceDropdowns[settingName] = true;
    this.voiceSearchSubjects[settingName].next(this.voiceSearchQueries[settingName]);
  }

  onVoiceInputBlur(settingName: string): void {
    setTimeout(() => {
      this.showVoiceDropdowns[settingName] = false;
    }, 200);
  }

  selectVoice(setting: Setting, voice: Voice): void {
    this.selectedVoices[setting.name] = voice;
    this.voiceSearchQueries[setting.name] = this.voicesService.getVoiceDisplayName(voice);
    this.showVoiceDropdowns[setting.name] = false;
    
    // Update setting value with JSON representation
    setting.value = JSON.stringify({
      providerName: voice.providerName,
      voiceId: voice.voiceId,
    });
  }

  getGroupedVoices(settingName: string): { provider: string; voices: Voice[] }[] {
    const grouped: Record<string, Voice[]> = {};
    
    this.filteredVoices[settingName]?.forEach((voice) => {
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

  saveSetting(setting: Setting): void {
    this.saving = true;
    this.error = null;
    this.successMessage = null;

    const valueToSave = setting.value || setting.default || '';
    
    this.settingsService.updateSetting(setting.name, valueToSave).subscribe({
      next: (updatedSetting) => {
        setting.value = updatedSetting.value;
        // Invalidate array cache if this is an array setting
        if (setting.type === SettingType.ARRAY) {
          delete this.arrayCache[setting.name];
          // Re-initialize cache with new value
          try {
            const parsed = JSON.parse(updatedSetting.value || '[]');
            this.arrayCache[setting.name] = Array.isArray(parsed) ? parsed : [];
          } catch {
            this.arrayCache[setting.name] = [];
          }
        }
        this.successMessage = `${setting.displayName} saved successfully`;
        this.saving = false;
        setTimeout(() => {
          this.successMessage = null;
        }, 3000);
      },
      error: (error) => {
        console.error('Error saving setting:', error);
        this.error = `Failed to save ${setting.displayName}`;
        this.saving = false;
      },
    });
  }

  saveAllSettings(): void {
    this.saving = true;
    this.error = null;
    this.successMessage = null;

    const saveObservables = this.settings.map((setting) =>
      this.settingsService.updateSetting(
        setting.name,
        setting.value || setting.default || ''
      )
    );

    forkJoin(saveObservables).subscribe({
      next: () => {
        this.successMessage = 'All settings saved successfully';
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
}

