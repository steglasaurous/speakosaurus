import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VoicesService, Voice } from '../../services/voices.service';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-voice-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './voice-selector.component.html',
  styleUrl: './voice-selector.component.scss',
})
export class VoiceSelectorComponent implements OnInit, OnChanges {
  @Input() selectedVoice: Voice | null = null;
  @Input() inputId = 'voice-select';
  @Input() placeholder = 'Type to search voices...';
  @Input() hint = 'Search and select a voice. Results are grouped by provider.';
  @Input() type = 'text';
  @Input() showLabel = true;
  @Output() voiceSelected = new EventEmitter<Voice | null>();

  voiceSearchQuery = '';
  availableVoices: Voice[] = [];
  filteredVoices: Voice[] = [];
  showVoiceDropdown = false;
  voiceSearchSubject = new Subject<string>();
  playingVoiceId: string | null = null;
  private dropdownMouseDown = false;

  private voicesService = inject(VoicesService);
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000/api';

  ngOnInit(): void {
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

    // Initialize display value if selectedVoice is provided
    this.updateDisplayValue();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedVoice'] && !changes['selectedVoice'].firstChange) {
      this.updateDisplayValue();
    }
  }

  updateDisplayValue(): void {
    if (this.selectedVoice) {
      this.voiceSearchQuery = this.voicesService.getVoiceDisplayName(this.selectedVoice);
    } else {
      this.voiceSearchQuery = '';
    }
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
      // Don't close if mouse was pressed inside dropdown
      if (!this.dropdownMouseDown) {
        this.showVoiceDropdown = false;
      }
      this.dropdownMouseDown = false;
    }, 200);
  }

  onDropdownMouseDown(): void {
    this.dropdownMouseDown = true;
  }

  selectVoice(voice: Voice): void {
    this.selectedVoice = voice;
    this.voiceSearchQuery = this.voicesService.getVoiceDisplayName(voice);
    this.showVoiceDropdown = false;
    this.voiceSelected.emit(voice);
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

  playPreview(event: Event, voice: Voice): void {
    event.preventDefault();
    event.stopPropagation(); // Prevent voice selection when clicking play button
    
    // Keep dropdown open
    this.showVoiceDropdown = true;

    if (this.playingVoiceId === voice.voiceId) {
      // If already playing this voice, stop it (note: we can't actually stop playback on backend)
      this.playingVoiceId = null;
      return;
    }

    this.playingVoiceId = voice.voiceId;

    // Call the preview API endpoint
    const previewPayload: any = {
      voiceProvider: voice.providerName,
      voiceId: voice.voiceId,
    };

    // Include previewUrl if available
    if (voice.previewUrl) {
      previewPayload.previewUrl = voice.previewUrl;
    }

    this.http.post(`${this.apiUrl}/speak/preview`, previewPayload).subscribe({
      next: () => {
        console.log('Preview queued for playback');
        // Audio is queued for playback on the backend
        // Reset playing state after a delay (we can't easily detect when it finishes)
        setTimeout(() => {
          this.playingVoiceId = null;
        }, 5000); // Approximate duration for preview
      },
      error: (error) => {
        console.error('Error playing voice preview:', error);
        this.playingVoiceId = null;
      },
    });
  }

  isPlaying(voice: Voice): boolean {
    return this.playingVoiceId === voice.voiceId;
  }
}

