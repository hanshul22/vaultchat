import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class AssignMediaToSpaceDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  mediaIds!: string[];
}
