import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateConversationDto {
  /**
   * UUIDs of participants to add (excluding the caller — the caller is
   * always added automatically). For 1:1 conversations supply exactly 1
   * UUID; for group conversations supply 2+ UUIDs.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  participantIds!: string[];

  @IsBoolean()
  isGroup!: boolean;

  /**
   * Required when isGroup = true. Ignored / should be omitted for 1:1.
   */
  @ValidateIf((o: CreateConversationDto) => o.isGroup === true)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  // Accepted but ignored for 1:1 — kept so the DTO stays forward-compatible
  // if the client always sends the field.
  nameOptional?: string;
}
