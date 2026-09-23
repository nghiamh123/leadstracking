import { IsIn, IsOptional } from 'class-validator';
import { PERSONA_KEYS, type PersonaKey } from '../personas/persona.js';

export class CreateConversationDto {
  /** Bỏ trống = trợ lý mặc định của role. */
  @IsOptional()
  @IsIn(PERSONA_KEYS)
  persona?: PersonaKey;
}
