import { ApiPropertyOptional } from '@nestjs/swagger';

export class VoiceTweaksDto {
  @ApiPropertyOptional({ description: 'Speaking speed multiplier (1 = default)', example: 1 })
  speed?: number;

  @ApiPropertyOptional({ description: 'Pitch multiplier (1 = default). Azure only.', example: 1 })
  pitch?: number;

  @ApiPropertyOptional({ description: 'Playback gain (1 = default)', example: 1 })
  volume?: number;

  @ApiPropertyOptional({ description: 'Azure speaking style', example: 'cheerful' })
  azureStyle?: string;

  @ApiPropertyOptional({ description: 'Azure style intensity (0.01–2)', example: 1 })
  azureStyleDegree?: number;

  @ApiPropertyOptional({ description: 'ElevenLabs stability (0–1)', example: 0.5 })
  elevenLabsStability?: number;

  @ApiPropertyOptional({ description: 'ElevenLabs similarity boost (0–1)', example: 0.75 })
  elevenLabsSimilarityBoost?: number;

  @ApiPropertyOptional({ description: 'ElevenLabs style exaggeration (0–1)', example: 0 })
  elevenLabsStyle?: number;

  @ApiPropertyOptional({ description: 'ElevenLabs speaker boost', example: true })
  elevenLabsUseSpeakerBoost?: boolean;

  @ApiPropertyOptional({ description: 'Piper noise scale / expressiveness', example: 0.667 })
  piperNoiseScale?: number;
}
