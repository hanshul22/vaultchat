import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StorageSpacesService } from '../../core/services/storage-spaces.service';
import { StorageSpace } from '../../core/models/storage-space.model';

@Component({
  selector: 'app-shared-spaces-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './shared-spaces-page.component.html',
  styleUrl: './shared-spaces-page.component.scss',
})
export class SharedSpacesPageComponent implements OnInit {
  private readonly spacesService = inject(StorageSpacesService);

  spaces: StorageSpace[] = [];
  loading = false;
  loadError = '';
  newSpaceName = '';
  creating = false;
  createError = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.spacesService.listSpaces().subscribe({
      next: (spaces) => {
        this.spaces = spaces;
        this.loading = false;
      },
      error: () => {
        this.loadError = 'Failed to load shared spaces.';
        this.loading = false;
      },
    });
  }

  createSpace(): void {
    const name = this.newSpaceName.trim();
    if (!name) return;
    this.creating = true;
    this.createError = '';
    this.spacesService.createSpace(name).subscribe({
      next: (space) => {
        this.spaces = [space, ...this.spaces];
        this.newSpaceName = '';
        this.creating = false;
      },
      error: () => {
        this.createError = 'Failed to create space.';
        this.creating = false;
      },
    });
  }
}
