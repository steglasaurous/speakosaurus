import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CustomVoicesService } from '../services/custom-voices.service';
import { VoiceProviderService } from '../services/voice-providers/voice-provider.service';
import {
  CreateCustomVoiceDto,
  CustomVoiceDto,
  UpdateCustomVoiceDto,
} from '../dto/custom-voice.dto';
import { VoiceDto } from '../dto/voice.dto';
import { toVoiceDto } from '../dto/voice-mapper';

@ApiTags('custom-voices')
@Controller('custom-voices')
export class CustomVoicesController {
  constructor(
    private readonly customVoicesService: CustomVoicesService,
    private readonly voiceProviderService: VoiceProviderService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List saved customized voices' })
  @ApiResponse({ status: 200, type: [CustomVoiceDto] })
  async list(): Promise<CustomVoiceDto[]> {
    const records = await this.customVoicesService.list();
    return records.map((record) => ({
      id: record.id,
      displayName: record.displayName,
      providerName: record.providerName,
      baseVoiceId: record.baseVoiceId,
      tweaks: record.tweaks ?? {},
    }));
  }

  @Post()
  @ApiOperation({ summary: 'Save a customized voice' })
  @ApiResponse({ status: 201, type: VoiceDto })
  async create(@Body() dto: CreateCustomVoiceDto): Promise<VoiceDto> {
    const base = await this.voiceProviderService.getStockVoice(
      dto.baseVoiceId,
      dto.providerName,
    );
    if (!base) {
      throw new NotFoundException(
        `Base voice '${dto.baseVoiceId}' not found in provider '${dto.providerName}'`,
      );
    }

    const record = await this.customVoicesService.create({
      displayName: dto.displayName || `${base.displayName || base.voiceName} custom`,
      providerName: dto.providerName,
      baseVoiceId: dto.baseVoiceId,
      tweaks: dto.tweaks ?? {},
      language: base.language,
      gender: base.gender,
      locale: base.locale,
      description: base.description,
      supportedStyles: base.supportedStyles,
    });

    const stock = await this.voiceProviderService.getStockVoices();
    return toVoiceDto(this.customVoicesService.toVoice(record, stock));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a customized voice' })
  @ApiResponse({ status: 200, type: VoiceDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomVoiceDto,
  ): Promise<VoiceDto> {
    const record = await this.customVoicesService.update(id, {
      displayName: dto.displayName,
      tweaks: dto.tweaks,
    });
    const stock = await this.voiceProviderService.getStockVoices();
    return toVoiceDto(this.customVoicesService.toVoice(record, stock));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a customized voice' })
  async remove(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.customVoicesService.remove(id);
    return { success: true };
  }
}
