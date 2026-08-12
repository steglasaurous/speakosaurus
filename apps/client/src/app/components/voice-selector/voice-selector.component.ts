import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VoicesService, Voice } from '../../services/voices.service';
import { SettingsService } from '../../services/settings.service';
import { UsersService, User } from '../../services/users.service';
import { Subscription } from 'rxjs';

export interface FavouriteVoiceRef {
  providerName: string;
  voiceId: string;
}

type ProviderFilter = 'all' | 'favourites' | string;

interface VoiceGroup {
  key: string;
  label: string;
  voices: Voice[];
}

interface FilterNavItem {
  key: string;
  label: string;
  count: number;
  favourite?: boolean;
}

const FAVOURITE_VOICES_SETTING = 'favouriteVoices';
const UNKNOWN_FILTER_KEY = '__unknown__';
const PROVIDER_LABELS: Record<string, string> = {
  favourites: 'Favourites',
  elevenlabs: 'ElevenLabs',
  azure: 'Azure',
  piper: 'Piper',
  ttsMonster: 'TTS Monster',
  ttsMonsterUnofficial: 'TTS Monster (Unofficial)',
  speakertts: 'SpeakerTTS',
};

@Component({
  selector: 'app-voice-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './voice-selector.component.html',
  styleUrl: './voice-selector.component.scss',
})
export class VoiceSelectorComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedVoice: Voice | null = null;
  @Input() inputId = 'voice-select';
  @Input() placeholder = 'Search voices…';
  @Input() hint =
    'Click to browse voices. Opening the picker does not filter by the current selection.';
  @Input() showLabel = true;
  /** When editing a user, their voice is not treated as "assigned to another user". */
  @Input() currentTwitchUserId: string | null = null;
  @Output() voiceSelected = new EventEmitter<Voice | null>();

  modalOpen = false;
  availableVoices: Voice[] = [];
  searchQuery = '';
  providerFilter: ProviderFilter = 'all';
  languageFilter = 'all';
  localeFilter = 'all';
  genderFilter = 'all';
  unassignedOnly = false;
  pendingVoice: Voice | null = null;
  favouriteKeys = new Set<string>();
  assignmentMap = new Map<string, string>();
  collapsedGroups = new Set<string>();
  /** Sidebar filter sections; only provider starts expanded. */
  expandedFilterSections = new Set<string>(['provider']);
  playingVoiceId: string | null = null;
  playingProviderName: string | null = null;

  /** Cached derived lists — avoid impure getters with *ngFor/@for. */
  providerNav: FilterNavItem[] = [];
  languageNav: FilterNavItem[] = [];
  localeNav: FilterNavItem[] = [];
  genderNav: FilterNavItem[] = [];
  voiceGroups: VoiceGroup[] = [];
  filteredCount = 0;

  private lastUsers: User[] = [];
  private subscriptions = new Subscription();
  private voicesService = inject(VoicesService);
  private settingsService = inject(SettingsService);
  private usersService = inject(UsersService);

  private escapeHandler = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.modalOpen) {
      event.stopImmediatePropagation();
      event.preventDefault();
      this.closeModal();
    }
  };

  ngOnInit(): void {
    this.loadVoices();
    this.loadFavourites();

    this.subscriptions.add(
      this.usersService.users$.subscribe((users) => {
        this.lastUsers = users;
        this.buildAssignmentMap(users);
        this.refreshDerivedLists();
      })
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentTwitchUserId']) {
      this.buildAssignmentMap(this.lastUsers);
      this.refreshDerivedLists();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.detachEscapeHandler();
  }

  get displayName(): string {
    if (!this.selectedVoice) {
      return 'No voice selected';
    }
    return this.selectedVoice.voiceName;
  }

  get displayDetail(): string {
    if (!this.selectedVoice) {
      return 'Choose a voice from the catalogue';
    }
    const parts = [
      this.selectedVoice.locale || this.selectedVoice.language,
      this.normalizeGender(this.selectedVoice.gender),
    ].filter(Boolean);
    if (parts.length) {
      return parts.join(' · ');
    }
    return this.voicesService.getVoiceDisplayName(this.selectedVoice);
  }

  get filtersActive(): boolean {
    return (
      this.providerFilter !== 'all' ||
      this.languageFilter !== 'all' ||
      this.localeFilter !== 'all' ||
      this.genderFilter !== 'all' ||
      this.unassignedOnly ||
      this.searchQuery.trim() !== ''
    );
  }

  get canApply(): boolean {
    if (!this.pendingVoice) {
      return false;
    }
    if (!this.selectedVoice) {
      return true;
    }
    return !this.isSameVoice(this.pendingVoice, this.selectedVoice);
  }

  get resultCountLabel(): string {
    const n = this.filteredCount;
    return `${n} voice${n === 1 ? '' : 's'}`;
  }

  openModal(): void {
    this.pendingVoice = this.selectedVoice;
    this.searchQuery = '';
    this.providerFilter = 'all';
    this.languageFilter = 'all';
    this.localeFilter = 'all';
    this.genderFilter = 'all';
    this.unassignedOnly = false;
    this.collapsedGroups = new Set();
    this.expandedFilterSections = new Set(['provider']);
    this.modalOpen = true;
    this.attachEscapeHandler();
    this.loadFavourites();
    this.loadVoices();
    this.refreshDerivedLists();
  }

  closeModal(): void {
    this.modalOpen = false;
    this.detachEscapeHandler();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closeModal();
    }
  }

  applySelection(): void {
    if (!this.canApply || !this.pendingVoice) {
      return;
    }
    this.selectedVoice = this.pendingVoice;
    this.voiceSelected.emit(this.pendingVoice);
    this.closeModal();
  }

  selectPending(voice: Voice): void {
    this.pendingVoice = voice;
  }

  setProviderFilter(key: ProviderFilter): void {
    this.providerFilter = key;
    this.refreshDerivedLists();
  }

  setLanguageFilter(key: string): void {
    this.languageFilter = key;
    // Drop locale filter if it no longer belongs to the selected language
    if (this.localeFilter !== 'all' && key !== 'all') {
      const localeLang = this.localeLanguage(this.localeFilter);
      if (localeLang && localeLang !== key) {
        this.localeFilter = 'all';
      }
    }
    this.refreshDerivedLists();
  }

  setLocaleFilter(key: string): void {
    this.localeFilter = key;
    this.refreshDerivedLists();
  }

  setGenderFilter(key: string): void {
    this.genderFilter = key;
    this.refreshDerivedLists();
  }

  onSearchChange(value: string): void {
    this.searchQuery = value;
    this.refreshDerivedLists();
  }

  onUnassignedChange(value: boolean): void {
    this.unassignedOnly = value;
    this.refreshDerivedLists();
  }

  clearFilters(): void {
    this.providerFilter = 'all';
    this.languageFilter = 'all';
    this.localeFilter = 'all';
    this.genderFilter = 'all';
    this.unassignedOnly = false;
    this.searchQuery = '';
    this.refreshDerivedLists();
  }

  isGroupCollapsed(key: string): boolean {
    return this.collapsedGroups.has(key);
  }

  toggleGroup(key: string): void {
    if (this.collapsedGroups.has(key)) {
      this.collapsedGroups.delete(key);
    } else {
      this.collapsedGroups.add(key);
    }
    this.collapsedGroups = new Set(this.collapsedGroups);
  }

  isFilterSectionExpanded(section: string): boolean {
    return this.expandedFilterSections.has(section);
  }

  toggleFilterSection(section: string): void {
    if (this.expandedFilterSections.has(section)) {
      this.expandedFilterSections.delete(section);
    } else {
      this.expandedFilterSections.add(section);
    }
    this.expandedFilterSections = new Set(this.expandedFilterSections);
  }

  filterSectionSummary(section: string): string | null {
    switch (section) {
      case 'provider':
        if (this.providerFilter === 'all') {
          return null;
        }
        if (this.providerFilter === 'favourites') {
          return 'Favourites';
        }
        return this.providerLabel(this.providerFilter);
      case 'language':
        return this.languageFilter === 'all'
          ? null
          : this.languageFilter === UNKNOWN_FILTER_KEY
            ? 'Unknown'
            : this.languageFilter;
      case 'locale':
        return this.localeFilter === 'all'
          ? null
          : this.localeFilter === UNKNOWN_FILTER_KEY
            ? 'Unknown'
            : this.localeFilter;
      case 'gender':
        return this.genderFilter === 'all'
          ? null
          : this.genderFilter === UNKNOWN_FILTER_KEY
            ? 'Unknown'
            : this.genderLabel(this.genderFilter);
      case 'availability':
        return this.unassignedOnly ? 'Unassigned only' : null;
      default:
        return null;
    }
  }

  isFavourite(voice: Voice): boolean {
    return this.favouriteKeys.has(this.voicesService.voiceKey(voice));
  }

  isPending(voice: Voice): boolean {
    return !!this.pendingVoice && this.isSameVoice(this.pendingVoice, voice);
  }

  isPlaying(voice: Voice): boolean {
    return (
      this.playingVoiceId === voice.voiceId &&
      this.playingProviderName === voice.providerName
    );
  }

  assignedTo(voice: Voice): string | null {
    return this.assignmentMap.get(this.voicesService.voiceKey(voice)) ?? null;
  }

  isAssignedToOther(voice: Voice): boolean {
    return this.assignedTo(voice) !== null;
  }

  toggleFavourite(event: Event, voice: Voice): void {
    event.preventDefault();
    event.stopPropagation();

    const key = this.voicesService.voiceKey(voice);
    if (this.favouriteKeys.has(key)) {
      this.favouriteKeys.delete(key);
    } else {
      this.favouriteKeys.add(key);
    }
    this.favouriteKeys = new Set(this.favouriteKeys);
    this.refreshDerivedLists();
    this.persistFavourites();
  }

  playPreview(event: Event, voice: Voice): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.isPlaying(voice)) {
      this.playingVoiceId = null;
      this.playingProviderName = null;
      return;
    }

    this.playingVoiceId = voice.voiceId;
    this.playingProviderName = voice.providerName;

    this.voicesService.previewVoice(voice).subscribe({
      next: () => {
        setTimeout(() => {
          if (this.isPlaying(voice)) {
            this.playingVoiceId = null;
            this.playingProviderName = null;
          }
        }, 5000);
      },
      error: (error) => {
        console.error('Error playing voice preview:', error);
        this.playingVoiceId = null;
        this.playingProviderName = null;
      },
    });
  }

  providerLabel(provider: string): string {
    return PROVIDER_LABELS[provider] || provider;
  }

  voiceMetaChips(voice: Voice): string[] {
    const chips: string[] = [];
    const locale = this.normalizeLocale(voice.locale);
    if (locale) {
      chips.push(locale);
    } else if (voice.language) {
      chips.push(voice.language.toLowerCase());
    }
    const gender = this.normalizeGender(voice.gender);
    if (gender) {
      chips.push(gender);
    }
    return chips;
  }

  trackByNav(_: number, item: FilterNavItem): string {
    return String(item.key);
  }

  trackByGroup(_: number, voiceGroup: VoiceGroup): string {
    return voiceGroup.key;
  }

  trackByVoice(_: number, voice: Voice): string {
    return this.voicesService.voiceKey(voice);
  }

  private refreshDerivedLists(): void {
    const filtered = this.availableVoices.filter((v) => this.matchesFilters(v));
    this.filteredCount = filtered.length;

    this.providerNav = this.buildProviderNav();
    this.languageNav = this.buildAttributeNav('language');
    this.localeNav = this.buildAttributeNav('locale');
    this.genderNav = this.buildAttributeNav('gender');

    const groups: VoiceGroup[] = [];

    if (this.providerFilter === 'favourites') {
      const favs = filtered.filter((v) => this.isFavourite(v));
      if (favs.length) {
        groups.push({ key: 'favourites', label: 'Favourites', voices: favs });
      }
    } else if (this.providerFilter !== 'all') {
      if (filtered.length) {
        groups.push({
          key: this.providerFilter,
          label: this.providerLabel(this.providerFilter),
          voices: filtered,
        });
      }
    } else {
      const favourites = filtered.filter((v) => this.isFavourite(v));
      if (favourites.length) {
        groups.push({
          key: 'favourites',
          label: 'Favourites',
          voices: favourites,
        });
      }
      for (const provider of this.uniqueProviders(filtered)) {
        const voices = filtered.filter((v) => v.providerName === provider);
        if (voices.length) {
          groups.push({
            key: provider,
            label: this.providerLabel(provider),
            voices,
          });
        }
      }
    }

    this.voiceGroups = groups;
  }

  private buildProviderNav(): FilterNavItem[] {
    const pool = this.availableVoices.filter((v) =>
      this.matchesFilters(v, { provider: true })
    );
    const providers = this.uniqueProviders(this.availableVoices);
    return [
      { key: 'all', label: 'All providers', count: pool.length },
      {
        key: 'favourites',
        label: 'Favourites',
        count: pool.filter((v) => this.isFavourite(v)).length,
        favourite: true,
      },
      ...providers.map((provider) => ({
        key: provider,
        label: this.providerLabel(provider),
        count: pool.filter((v) => v.providerName === provider).length,
      })),
    ];
  }

  private buildAttributeNav(
    attribute: 'language' | 'locale' | 'gender'
  ): FilterNavItem[] {
    const omit =
      attribute === 'language'
        ? { language: true }
        : attribute === 'locale'
          ? { locale: true }
          : { gender: true };
    const pool = this.availableVoices.filter((v) => this.matchesFilters(v, omit));

    const counts = new Map<string, number>();
    let unknownCount = 0;
    for (const voice of pool) {
      const raw =
        attribute === 'language'
          ? this.voiceLanguage(voice)
          : attribute === 'locale'
            ? this.normalizeLocale(voice.locale)
            : this.normalizeGender(voice.gender);
      if (!raw) {
        unknownCount += 1;
        continue;
      }
      counts.set(raw, (counts.get(raw) || 0) + 1);
    }

    // When a language is selected, only show locales for that language
    let keys = [...counts.keys()].sort((a, b) => a.localeCompare(b));
    if (attribute === 'locale' && this.languageFilter !== 'all') {
      keys = keys.filter((locale) => this.localeLanguage(locale) === this.languageFilter);
    }

    const allLabel =
      attribute === 'language'
        ? 'All languages'
        : attribute === 'locale'
          ? 'All locales'
          : 'All genders';

    const items: FilterNavItem[] = [
      { key: 'all', label: allLabel, count: pool.length },
      ...keys.map((key) => ({
        key,
        label: attribute === 'gender' ? this.genderLabel(key) : key,
        count: counts.get(key) || 0,
      })),
    ];

    if (unknownCount > 0) {
      items.push({
        key: UNKNOWN_FILTER_KEY,
        label: 'Unknown',
        count: unknownCount,
      });
    }

    return items;
  }

  private loadVoices(): void {
    this.voicesService.getVoices().subscribe({
      next: (voices) => {
        this.availableVoices = voices;
        this.refreshDerivedLists();
      },
      error: (error) => {
        console.error('Error loading voices:', error);
      },
    });
  }

  private loadFavourites(): void {
    this.settingsService.getSetting(FAVOURITE_VOICES_SETTING).subscribe({
      next: (setting) => {
        this.favouriteKeys = this.parseFavouriteKeys(setting.value);
        this.refreshDerivedLists();
      },
      error: () => {
        this.favouriteKeys = new Set();
        this.refreshDerivedLists();
      },
    });
  }

  private persistFavourites(): void {
    const refs: FavouriteVoiceRef[] = [...this.favouriteKeys].map((key) => {
      const [providerName, ...rest] = key.split('::');
      return { providerName, voiceId: rest.join('::') };
    });

    this.settingsService
      .updateSetting(FAVOURITE_VOICES_SETTING, JSON.stringify(refs))
      .subscribe({
        error: (error) => {
          console.error('Error saving favourite voices:', error);
        },
      });
  }

  private parseFavouriteKeys(value: string | null): Set<string> {
    if (!value) {
      return new Set();
    }
    try {
      const parsed = JSON.parse(value) as FavouriteVoiceRef[];
      if (!Array.isArray(parsed)) {
        return new Set();
      }
      return new Set(
        parsed
          .filter((r) => r?.providerName && r?.voiceId)
          .map((r) => this.voicesService.voiceKey(r))
      );
    } catch {
      return new Set();
    }
  }

  private buildAssignmentMap(users: User[]): void {
    const map = new Map<string, string>();
    for (const user of users) {
      if (!user.ttsProviderName || !user.ttsVoiceId) {
        continue;
      }
      if (
        this.currentTwitchUserId &&
        user.twitchUserId === this.currentTwitchUserId
      ) {
        continue;
      }
      const key = `${user.ttsProviderName}::${user.ttsVoiceId}`;
      if (!map.has(key)) {
        map.set(key, user.twitchUsername);
      }
    }
    this.assignmentMap = map;
  }

  private matchesSecondaryFilters(
    voice: Voice,
    omit: {
      language?: boolean;
      locale?: boolean;
      gender?: boolean;
      unassigned?: boolean;
      search?: boolean;
    } = {}
  ): boolean {
    if (!omit.unassigned && this.unassignedOnly && this.isAssignedToOther(voice)) {
      return false;
    }
    if (!omit.language && this.languageFilter !== 'all') {
      const language = this.voiceLanguage(voice);
      if (this.languageFilter === UNKNOWN_FILTER_KEY) {
        if (language) {
          return false;
        }
      } else if (language !== this.languageFilter) {
        return false;
      }
    }
    if (!omit.locale && this.localeFilter !== 'all') {
      const locale = this.normalizeLocale(voice.locale);
      if (this.localeFilter === UNKNOWN_FILTER_KEY) {
        if (locale) {
          return false;
        }
      } else if (locale !== this.localeFilter) {
        return false;
      }
    }
    if (!omit.gender && this.genderFilter !== 'all') {
      const gender = this.normalizeGender(voice.gender);
      if (this.genderFilter === UNKNOWN_FILTER_KEY) {
        if (gender) {
          return false;
        }
      } else if (gender !== this.genderFilter) {
        return false;
      }
    }
    if (!omit.search && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      const hay = [
        voice.voiceName,
        voice.providerName,
        voice.displayName,
        voice.voiceId,
        voice.language,
        voice.locale,
        voice.gender,
        voice.description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) {
        return false;
      }
    }
    return true;
  }

  private matchesProvider(voice: Voice): boolean {
    if (this.providerFilter === 'all') {
      return true;
    }
    if (this.providerFilter === 'favourites') {
      return this.isFavourite(voice);
    }
    return voice.providerName === this.providerFilter;
  }

  private matchesFilters(
    voice: Voice,
    omit: {
      provider?: boolean;
      language?: boolean;
      locale?: boolean;
      gender?: boolean;
      unassigned?: boolean;
      search?: boolean;
    } = {}
  ): boolean {
    if (!omit.provider && !this.matchesProvider(voice)) {
      return false;
    }
    return this.matchesSecondaryFilters(voice, omit);
  }

  private uniqueProviders(voices: Voice[]): string[] {
    return [...new Set(voices.map((v) => v.providerName))].sort((a, b) =>
      this.providerLabel(a).localeCompare(this.providerLabel(b))
    );
  }

  private voiceLanguage(voice: Voice): string | null {
    if (voice.language?.trim()) {
      return voice.language.trim().toLowerCase().slice(0, 2);
    }
    const locale = this.normalizeLocale(voice.locale);
    return locale ? this.localeLanguage(locale) : null;
  }

  private localeLanguage(locale: string): string | null {
    const normalized = this.normalizeLocale(locale);
    if (!normalized) {
      return null;
    }
    return normalized.split('-')[0]?.toLowerCase() || null;
  }

  private normalizeLocale(locale?: string | null): string | null {
    if (!locale?.trim()) {
      return null;
    }
    const parts = locale.trim().replace(/_/g, '-').split('-');
    if (parts.length === 1) {
      return parts[0].toLowerCase();
    }
    return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
  }

  private normalizeGender(gender?: string | null): string | null {
    if (!gender?.trim()) {
      return null;
    }
    const value = gender.trim().toLowerCase();
    if (value === 'male' || value === 'female' || value === 'other') {
      return value;
    }
    // ElevenLabs sometimes uses "non-binary" / similar
    if (value.includes('female') || value === 'f') {
      return 'female';
    }
    if (value.includes('male') || value === 'm') {
      return 'male';
    }
    return 'other';
  }

  private genderLabel(gender: string): string {
    if (gender === 'male') {
      return 'Male';
    }
    if (gender === 'female') {
      return 'Female';
    }
    if (gender === 'other') {
      return 'Other';
    }
    return gender;
  }

  private isSameVoice(a: Voice, b: Voice): boolean {
    return a.voiceId === b.voiceId && a.providerName === b.providerName;
  }

  private attachEscapeHandler(): void {
    document.addEventListener('keydown', this.escapeHandler, true);
  }

  private detachEscapeHandler(): void {
    document.removeEventListener('keydown', this.escapeHandler, true);
  }
}
